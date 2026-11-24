import type { CompanionInputFieldDropdown, CompanionInputFieldNumber, DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { labelOf, refOf } from './state.js'

/** Entries by the name a user would type: the remote ID, or else the label. */
export function entryChoices(self: ModuleInstance): DropdownChoice<string>[] {
	return self.state.reachable().map(({ entry, parent }) => {
		const id = refOf(entry)
		const label = labelOf(entry)
		const extra = [id === label ? '' : id, parent ? `in ${labelOf(parent)}` : ''].filter(Boolean).join(', ')
		return { id, label: extra ? `${label} (${extra})` : label }
	})
}

/** Empty means the first server in the client's settings. */
function serverChoices(self: ModuleInstance): DropdownChoice<string>[] {
	return [
		{ id: '', label: 'First server' },
		...self.state.live.devices.map((server) => ({ id: server.name, label: server.name })),
	]
}

/** What the dropdowns are made from, to tell when they have to be made again. */
export function choiceKey(self: ModuleInstance): string {
	return JSON.stringify([entryChoices(self), serverChoices(self), channelChoices(self)])
}

/** The same for the presets. */
export function presetKey(self: ModuleInstance): string {
	const { state } = self
	return JSON.stringify([
		choiceKey(self),
		state.reachable().map((f) => [f.entry.type, f.rundown.id]),
		state.rundowns.map((r) => [r.id, r.name]),
		state.live.devices[0]?.channels.length,
		[...state.layersInUse()],
	])
}

export const listIds = (choices: DropdownChoice<string>[]): string => `One of: ${choices.map((c) => c.id).join(', ')}`

export function entryField(self: ModuleInstance): CompanionInputFieldDropdown<'entry', string> {
	const choices = entryChoices(self)
	return {
		id: 'entry',
		type: 'dropdown',
		label: 'Rundown entry',
		description: 'Choose one, or type a remote ID or label',
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
		expressionDescription: 'The remote ID or label of an entry in an open rundown',
	}
}

export function serverField(self: ModuleInstance): CompanionInputFieldDropdown<'server', string> {
	return {
		id: 'server',
		type: 'dropdown',
		label: 'CasparCG server',
		choices: serverChoices(self),
		default: '',
		allowCustom: true,
		expressionDescription: 'The name of a server in CasparCG Advanced Client. Empty = the first one',
	}
}

/** Channels by number, with their names. Those of other servers are named after the server. */
function channelChoices(self: ModuleInstance): DropdownChoice<number>[] {
	const servers = self.state.live.devices
	const count = Math.max(1, ...servers.map((s) => s.channels.length))
	return Array.from({ length: count }, (_, k) => {
		const names = servers.flatMap((s) => {
			const name = self.state.channelName(s.name, k + 1)
			return name ? [servers.length > 1 ? `${name} on ${s.name}` : name] : []
		})
		return { id: k + 1, label: [String(k + 1), names.join(', ')].filter(Boolean).join(' ') }
	})
}

export function channelField<K extends string>(
	self: ModuleInstance,
	id: K,
	label: string,
	value: number,
): CompanionInputFieldDropdown<K, string | number> {
	return {
		id,
		type: 'dropdown',
		label,
		description: 'Choose one, or type a number or name',
		choices: channelChoices(self),
		default: value,
		allowCustom: true,
		expressionDescription: 'The number or the name of a channel',
	}
}

export function layerField<K extends string>(id: K, label: string, value: number): CompanionInputFieldNumber<K> {
	return { id, type: 'number', label, default: value, min: 0, max: 9999, asInteger: true }
}
