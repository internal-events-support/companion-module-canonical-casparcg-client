import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { entryChoices, serverChoices } from './choices.js'
import { GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { FEEDBACKS, UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { Link, type LinkState } from './link.js'
import { UpdatePresets } from './presets.js'
import { ClientState, type LiveState, type RundownPut } from './state.js'
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
	tooOld: InstanceStatus.UnknownError,
}

/** Someone typing a label should not rebuild every list for each letter. */
const REDEFINE_AFTER = 500

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	readonly state = new ClientState()
	readonly #variables = new Variables(this)
	#link: Link | null = null
	#redefineTimer: NodeJS.Timeout | null = null
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
		this.#connect(config, secrets)
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The id of an entry, from what the user calls it. */
	entryId(ref: string): string {
		const found = this.state.find(ref)
		if (!found) throw new Error(`No open rundown has an entry called "${ref}"`)
		return found.entry.id
	}

	serverName(name: string): string {
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

	#connect(config: ModuleConfig, secrets: ModuleSecrets): void {
		const host = config.host?.trim()
		if (!host || !config.port) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the address and port of CasparCG Client')
			return
		}
		if (!secrets?.code) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the access code')
			return
		}
		const link = new Link(host, config.port, secrets.code, {
			state: (state, message) => this.updateStatus(STATUS[state], message),
			message: (name, args) => this.#message(name, args),
			ready: async () => {
				const all = (await link.call('init', [])) as { docs: RundownPut[]; state: LiveState; version: string }
				this.state.setRundowns(all.docs)
				this.state.live = all.state
				this.state.version = all.version
				this.#define()
				this.#refresh()
				this.checkAllFeedbacks()
			},
		})
		this.#link = link
		link.start()
	}

	#disconnect(): void {
		this.#link?.stop()
		this.#link = null
		if (this.#redefineTimer) clearTimeout(this.#redefineTimer)
		this.#redefineTimer = null
		this.state.reset()
		this.#variables.reset()
		this.#shown = ''
	}

	#message(name: string, args: unknown[]): void {
		if (name === 'state') this.state.live = args[0] as LiveState
		else if (name === 'docs') {
			const news = args[0] as { put: RundownPut[]; drop: string[] }
			this.state.update(news.put, news.drop)
		} else return
		this.#refresh()
		if (this.#choices !== this.#choiceKey()) {
			this.#redefineTimer ??= setTimeout(() => {
				this.#redefineTimer = null
				this.#define()
			}, REDEFINE_AFTER)
		}
	}

	/** Update variables and feedbacks when something they can show has changed. */
	#refresh(): void {
		const { state } = this
		const layers = Object.keys(state.live.layers).map((key) => {
			const bar = key.lastIndexOf('|')
			const [channel, layer] = key
				.slice(bar + 1)
				.split('-')
				.map(Number)
			const info = state.layerInfo({ device: key.slice(0, bar), channel, layer })
			return [key, { ...info, seconds: info.seconds === null ? null : Math.ceil(info.seconds) }]
		})
		const entries = state.entries().map((f) => [f.entry.id, f.entry.label, f.entry.remoteId])
		const shown = JSON.stringify([layers, state.live.decks, state.live.items, state.live.devices, entries])
		if (shown === this.#shown) return
		this.#shown = shown
		this.#variables.update()
		this.checkFeedbacks(...FEEDBACKS)
	}

	#choiceKey(): string {
		const { rundowns, live } = this.state
		return JSON.stringify([
			entryChoices(this),
			serverChoices(this),
			rundowns.map((r) => [r.id, r.name]),
			live.devices[0]?.channels.length,
		])
	}

	#define(): void {
		this.#choices = this.#choiceKey()
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		this.#variables.update()
	}
}
