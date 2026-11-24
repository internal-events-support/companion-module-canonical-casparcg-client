import { isIPv6 } from 'node:net'
import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { choiceKey } from './choices.js'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { Link, type LinkState } from './link.js'
import { UpdatePresets } from './presets.js'
import { ClientState, ON_LAYER, type LiveState, type Place, type RundownPut } from './state.js'
import { UpgradeScripts } from './upgrades.js'
import { Variables, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const STATUS: Record<LinkState, InstanceStatus> = {
	connecting: InstanceStatus.Connecting,
	ok: InstanceStatus.Ok,
	failed: InstanceStatus.ConnectionFailure,
	wrongCode: InstanceStatus.AuthenticationFailure,
	tooOld: InstanceStatus.ConnectionFailure,
}

/** Someone typing a label should not rebuild every list for each letter. */
const REDEFINE_AFTER = 500

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	readonly state = new ClientState()
	readonly #variables = new Variables(this)
	#link: Link | null = null
	#redefineTimer: NodeJS.Timeout | null = null
	/** The client has been read, so what is asked for can be looked up. */
	#ready = false
	#choices = ''
	#shown = ''

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.#define()
		this.#connect(config, secrets)
	}

	async destroy(): Promise<void> {
		this.#disconnect()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.#disconnect()
		this.#define()
		this.checkAllFeedbacks()
		this.#connect(config, secrets)
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The id of an entry, from what the user calls it. */
	entryId(ref: string): string {
		this.#mustBeReady()
		const found = this.state.find(ref)
		if (!found) throw new Error(`No open rundown has an entry called "${ref}"`)
		return found.entry.id
	}

	serverName(name: string): string {
		this.#mustBeReady()
		const server = this.state.server(name)
		if (!this.state.live.devices.some((s) => s.name === server)) {
			throw new Error(name ? `CasparCG Client has no server called "${name}"` : 'CasparCG Client has no servers')
		}
		return server
	}

	/** Ask the client to do something. */
	async command(name: string, args: unknown[], signal: AbortSignal): Promise<unknown> {
		if (!this.#link) throw new Error('Not connected to CasparCG Client')
		return this.#link.call(name, args, signal)
	}

	/**
	 * Clear a layer, or a whole channel. Through an entry when there is one there, because then the client also
	 * forgets what it had loaded; a bare CLEAR would leave a loaded entry to be played when it is gone.
	 */
	async clear(at: Place, whole: boolean, signal: AbortSignal): Promise<void> {
		const found = this.state.entries().find(({ entry, parent }) => {
			if (!ON_LAYER.includes(entry.type) || parent?.type === 'PLAYLIST') return false
			const there = this.state.server(entry.device) === at.device && entry.channel === at.channel
			return there && (whole || entry.layer === at.layer)
		})
		if (found) await this.command('execute', [found.entry.id, whole ? 'clearChannel' : 'clearLayer'], signal)
		else if (whole) {
			// The same as the client does, so it makes no difference which way it goes.
			await this.command('raw', [at.device, `CLEAR ${at.channel}`], signal)
			await this.command('raw', [at.device, `MIXER ${at.channel} CLEAR`], signal)
		} else await this.command('raw', [at.device, `CLEAR ${at.channel}-${at.layer}`], signal)
	}

	#mustBeReady(): void {
		if (!this.#ready) throw new Error('Not connected to CasparCG Client')
	}

	#connect(config: ModuleConfig, secrets: ModuleSecrets): void {
		const host = config.host?.trim()
		const code = secrets?.code?.trim()
		if (!host || !config.port) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the address and port of CasparCG Client')
			return
		}
		if (/[/\s@?#]/.test(host) || (host.includes(':') && !isIPv6(host))) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter only the address, without http:// or a port')
			return
		}
		if (!code) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the access code')
			return
		}
		const link = new Link(host, config.port, code, {
			state: (state, message) => this.#linkState(state, message),
			message: (name, args) => this.#message(name, args),
			ready: async () => {
				const all = (await link.call('init', [])) as { docs: RundownPut[]; state: LiveState; version: string }
				this.state.setRundowns(all.docs)
				this.state.live = all.state
				this.state.version = all.version
				this.#ready = true
				this.#define()
				this.#refresh()
				this.checkAllFeedbacks()
			},
		})
		this.#link = link
		link.start()
	}

	#linkState(state: LinkState, message?: string): void {
		this.updateStatus(STATUS[state], message)
		if (state === 'ok') this.log('info', `Connected to CasparCG Client ${this.state.version}`)
		else if (state === 'connecting') this.log('debug', 'Connecting')
		else this.log(this.#ready ? 'warn' : 'debug', message ?? state)
		if (state === 'ok' || !this.#ready) return
		// Buttons must not go on showing what was playing before.
		this.#ready = false
		this.state.lost()
		this.#refresh()
	}

	#disconnect(): void {
		this.#link?.stop()
		this.#link = null
		if (this.#redefineTimer) clearTimeout(this.#redefineTimer)
		this.#redefineTimer = null
		this.#ready = false
		this.state.reset()
		this.#variables.reset()
		this.#shown = ''
	}

	#message(name: string, args: unknown[]): void {
		switch (name) {
			case 'state':
				this.state.live = args[0] as LiveState
				break
			case 'docs': {
				const news = args[0] as { put: RundownPut[]; drop: string[] }
				this.state.update(news.put, news.drop)
				break
			}
			case 'toast': // what went wrong after an action had been accepted, such as an entry with a delay
				if (args[1] === 'bad') this.log('warn', String(args[0]))
				return
			case 'playout':
				this.log('warn', 'A Playout Command entry acts on the screen that plays it, so it does nothing from Companion')
				return
			default:
				return
		}
		if (this.#refresh()) this.#redefineSoon()
	}

	#redefineSoon(): void {
		if (this.#redefineTimer || this.#choices === choiceKey(this)) return
		this.#redefineTimer = setTimeout(() => {
			this.#redefineTimer = null
			this.#define()
		}, REDEFINE_AFTER)
	}

	/** Update variables and feedbacks when something they can show has changed. Says whether it had. */
	#refresh(): boolean {
		const { state } = this
		const layers = Object.keys(state.live.layers).map((key) => {
			const bar = key.lastIndexOf('|')
			const [channel, layer] = key
				.slice(bar + 1)
				.split('-')
				.map(Number)
			return [key, state.layerInfo({ device: key.slice(0, bar), channel, layer })]
		})
		const entries = state
			.entries()
			.map(({ entry: e }) => [e.id, e.type, e.label, e.name, e.remoteId, e.device, e.channel, e.layer])
		const rundowns = state.rundowns.map((r) => [r.id, r.name])
		const shown = JSON.stringify([layers, state.live.decks, state.live.items, state.live.devices, entries, rundowns])
		if (shown === this.#shown) return false
		this.#shown = shown
		this.#variables.update()
		this.checkAllFeedbacks()
		return true
	}

	#define(): void {
		this.#choices = choiceKey(this)
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		this.#variables.update()
	}
}
