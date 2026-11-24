import type { CompanionInputFieldDropdown, CompanionInputFieldNumber, DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { labelOf, refOf } from './state.js'

/** Entries by the name a user would type: the remote ID, or else the label. */
export function entryChoices(self: ModuleInstance): DropdownChoice<string>[] {
	return self.state.reachable().map(({ entry, parent }) => {
		const id = refOf(entry)
		const label = labelOf(entry)
		const extra = [id === label ? '' : id, parent ? `in ${parent.label}` : ''].filter(Boolean).join(', ')
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

/** Everything the dropdowns and presets are made from, to tell when they have to be made again. */
export function choiceKey(self: ModuleInstance): string {
	const { rundowns, live } = self.state
	return JSON.stringify([
		entryChoices(self),
		self.state.reachable().map((f) => f.entry.type),
		serverChoices(self),
		rundowns.map((r) => [r.id, r.name]),
		live.devices[0]?.channels.length,
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
		expressionDescription: 'The name of a server in CasparCG Client. Empty = the first one',
	}
}

export function channelField<K extends string>(id: K, label: string, value: number): CompanionInputFieldNumber<K> {
	return { id, type: 'number', label, default: value, min: 1, max: 99, asInteger: true }
}

export function layerField<K extends string>(id: K, label: string, value: number): CompanionInputFieldNumber<K> {
	return { id, type: 'number', label, default: value, min: 0, max: 9999, asInteger: true }
}
