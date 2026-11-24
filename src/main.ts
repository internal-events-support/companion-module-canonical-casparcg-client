import { isIPv6 } from 'node:net'
import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { choiceKey } from './choices.js'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { Link, type LinkState } from './link.js'
import { UpdatePresets } from './presets.js'
import { ClientState, ON_LAYER, type ClientSettings, type LiveState, type Place, type RundownPut } from './state.js'
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

type ClientInit = { docs: RundownPut[]; state: LiveState; version: string; settings: ClientSettings }

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
	 * Clear a layer, or a whole channel, and have the client forget what was there. Otherwise a loaded entry would
	 * be played when it is gone, and a playlist would carry on when it is next edited.
	 */
	async clear(at: Place, whole: boolean, signal: AbortSignal): Promise<void> {
		const here = (p: Place) => p.device === at.device && p.channel === at.channel && (whole || p.layer === at.layer)
		for (const { device, channel, layer } of this.state.live.decks.filter(here)) {
			await this.command('transport', [{ device, channel, layer }, 'stop'], signal)
		}
		const found = this.state
			.entries()
			.find(({ entry, parent }) => ON_LAYER.includes(entry.type) && parent?.type !== 'PLAYLIST' && here(entry))
		if (found) {
			try {
				await this.command('execute', [found.entry.id, whole ? 'clearChannel' : 'clearLayer'], signal)
				return
			} catch (e) {
				// Clearing must not depend on an entry.
				this.log('debug', `Cleared without "${found.entry.label}": ${e instanceof Error ? e.message : String(e)}`)
			}
		}
		// The same as the client sends for an entry, and to the same servers.
		const commands = whole ? [`CLEAR ${at.channel}`, `MIXER ${at.channel} CLEAR`] : [`CLEAR ${at.channel}-${at.layer}`]
		const shadows = this.state.live.devices.filter((s) => s.connected && this.state.shadows.includes(s.name))
		const servers = new Set([at.device, ...shadows.map((s) => s.name)])
		for (const server of servers) {
			for (const command of commands) await this.command('raw', [server, command], signal)
		}
	}

	#mustBeReady(): void {
		if (!this.#ready) throw new Error('Not connected to CasparCG Client')
	}

	#connect(config: ModuleConfig, secrets: ModuleSecrets): void {
		const host = config.host?.trim().replace(/^\[(.*)\]$/, '$1')
		const code = secrets?.code?.trim()
		if (!host || !config.port) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the address and port of CasparCG Client')
			return
		}
		if (!/^[\p{L}\p{N}._-]+$/u.test(host) && (!isIPv6(host) || host.includes('%'))) {
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
				const all = (await link.call('init', [])) as ClientInit
				this.state.setRundowns(all.docs)
				this.state.live = all.state
				this.state.version = all.version
				this.state.setSettings(all.settings)
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
			case 'settings':
				this.state.setSettings(args[0] as ClientSettings)
				return
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
		const entries = state.entries().map(({ entry: e, parent, rundown }) => [
			[rundown.id, parent?.id, parent?.label, e.id, e.type],
			[e.label, e.name, e.remoteId, e.device, e.channel, e.layer],
		])
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
