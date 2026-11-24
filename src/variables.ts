import type { CompanionVariableDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { refOf } from './state.js'

export type VariablesSchema = {
	client_version: string
	rundowns: string
	servers: number
	servers_connected: number
	[layerState: `layer_${number}_${number}_state`]: string
	[layerName: `layer_${number}_${number}_name`]: string
	[layerLeft: `layer_${number}_${number}_left`]: string
	[layerSeconds: `layer_${number}_${number}_seconds`]: number | null
	[layerElapsed: `layer_${number}_${number}_elapsed`]: string
	[layerDuration: `layer_${number}_${number}_duration`]: string
	[layerNext: `layer_${number}_${number}_next`]: string
	[layerPlaylist: `layer_${number}_${number}_playlist`]: string
	[layerClip: `layer_${number}_${number}_clip`]: string
	[entryLabel: `entry_${string}_label`]: string
	[entryState: `entry_${string}_state`]: string
	[entryLeft: `entry_${string}_left`]: string
}

/** Variable ids may only hold these. */
const clean = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')

export class Variables {
	readonly #self: ModuleInstance
	/** Layers of the first server that have had something on them since connecting. */
	readonly #layers = new Set<string>()
	#server = ''
	#defined = ''
	#sent = new Map<string, unknown>()

	constructor(self: ModuleInstance) {
		this.#self = self
	}

	reset(): void {
		this.#layers.clear()
		this.#defined = ''
		this.#sent.clear()
	}

	/** Entries with a remote ID. Two that look alike as a variable's name get a number. */
	#entries() {
		const seen = new Map<string, number>()
		return this.#self.state.reachable().flatMap((found) => {
			if (!found.entry.remoteId.trim()) return []
			const id = clean(refOf(found.entry))
			const n = (seen.get(id.toLowerCase()) ?? 0) + 1
			seen.set(id.toLowerCase(), n)
			return [{ id: n === 1 ? id : `${id}_${n}`, found }]
		})
	}

	update(): void {
		const { state } = this.#self
		const server = state.server()
		if (server !== this.#server) this.#layers.clear()
		this.#server = server
		for (const [key, layer] of Object.entries(state.live.layers)) {
			const at = key.lastIndexOf('|')
			if (key.slice(0, at) === server && layer.producer !== 'empty') this.#layers.add(key.slice(at + 1))
		}
		const layers = [...this.#layers].map((k) => k.split('-').map(Number) as [number, number])
		layers.sort((a, b) => a[0] - b[0] || a[1] - b[1])
		const entries = this.#entries()
		this.#define(layers, entries)

		// Only what changed: the client reports many times a second.
		const changed: Partial<VariablesSchema> = {}
		const put = <K extends keyof VariablesSchema>(id: K, value: VariablesSchema[K]) => {
			if (this.#sent.get(id) === value) return
			this.#sent.set(id, value)
			changed[id] = value
		}
		put('client_version', state.version)
		put('rundowns', state.rundowns.map((r) => r.name).join(', '))
		put('servers', state.live.devices.length)
		put('servers_connected', state.live.devices.filter((s) => s.connected).length)
		for (const [channel, layer] of layers) {
			const info = state.layerInfo({ device: server, channel, layer })
			put(`layer_${channel}_${layer}_state`, info.state)
			put(`layer_${channel}_${layer}_name`, info.name)
			put(`layer_${channel}_${layer}_left`, info.left)
			put(`layer_${channel}_${layer}_seconds`, info.seconds)
			put(`layer_${channel}_${layer}_elapsed`, info.elapsed)
			put(`layer_${channel}_${layer}_duration`, info.duration)
			put(`layer_${channel}_${layer}_next`, info.next)
			put(`layer_${channel}_${layer}_playlist`, info.playlist)
			put(`layer_${channel}_${layer}_clip`, info.clip)
		}
		for (const { id, found } of entries) {
			put(`entry_${id}_label`, found.entry.label)
			put(`entry_${id}_state`, state.entryState(found))
			put(`entry_${id}_left`, state.entryLeft(found))
		}
		if (Object.keys(changed).length) this.#self.setVariableValues(changed)
	}

	#define(layers: [number, number][], entries: { id: string }[]): void {
		const key = JSON.stringify([layers, entries.map((e) => e.id)])
		if (key === this.#defined) return
		this.#defined = key
		const all: CompanionVariableDefinitions<VariablesSchema> = {
			client_version: { name: 'Version of CasparCG Client' },
			rundowns: { name: 'Open rundowns' },
			servers: { name: 'Number of CasparCG servers' },
			servers_connected: { name: 'Number of CasparCG servers connected' },
		}
		for (const [channel, layer] of layers) {
			const name = `Layer ${channel}-${layer}`
			all[`layer_${channel}_${layer}_state`] = { name: `${name}: state` }
			all[`layer_${channel}_${layer}_name`] = { name: `${name}: clip name` }
			all[`layer_${channel}_${layer}_left`] = { name: `${name}: time left` }
			all[`layer_${channel}_${layer}_seconds`] = { name: `${name}: time left in seconds` }
			all[`layer_${channel}_${layer}_elapsed`] = { name: `${name}: time played` }
			all[`layer_${channel}_${layer}_duration`] = { name: `${name}: length` }
			all[`layer_${channel}_${layer}_next`] = { name: `${name}: next clip` }
			all[`layer_${channel}_${layer}_playlist`] = { name: `${name}: playlist` }
			all[`layer_${channel}_${layer}_clip`] = { name: `${name}: clip number in the playlist` }
		}
		for (const { id } of entries) {
			all[`entry_${id}_label`] = { name: `Entry ${id}: label` }
			all[`entry_${id}_state`] = { name: `Entry ${id}: state` }
			all[`entry_${id}_left`] = { name: `Entry ${id}: time left` }
		}
		this.#sent.clear()
		this.#self.setVariableDefinitions(all)
	}
}
