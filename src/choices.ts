import type { DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { refOf } from './state.js'

/** Entries by the name a user would type: the remote ID, or else the label. */
export function entryChoices(self: ModuleInstance): DropdownChoice<string>[] {
	const seen = new Set<string>()
	const out: DropdownChoice<string>[] = []
	for (const { entry, parent } of self.state.entries()) {
		const id = refOf(entry)
		const key = id.toLowerCase()
		// Only the first of two entries with one name can be found by it.
		if (!id || seen.has(key)) continue
		seen.add(key)
		const label = entry.label.trim() || entry.name.trim()
		const extra = [id === label ? '' : id, parent ? `in ${parent.label}` : ''].filter(Boolean).join(', ')
		out.push({ id, label: extra ? `${label} (${extra})` : label })
	}
	return out
}

/** Empty means the first server in the client's settings. */
export function serverChoices(self: ModuleInstance): DropdownChoice<string>[] {
	return [
		{ id: '', label: 'First server' },
		...self.state.live.devices.map((server) => ({ id: server.name, label: server.name })),
	]
}
