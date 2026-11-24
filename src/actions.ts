import type { CompanionInputFieldNumber, CompanionInputFieldTextInput, DropdownChoice } from '@companion-module/base'
import { entryChoices, serverChoices } from './choices.js'
import type ModuleInstance from './main.js'

export type ActionsSchema = {
	entry: {
		options: {
			entry: string
			command: string
		}
	}
	mark_used: {
		options: {
			entry: string
			used: string
		}
	}
	layer: {
		options: {
			server: string
			channel: number
			layer: number
			command: string
		}
	}
	take: {
		options: {
			server: string
			fromChannel: number
			fromLayer: number
			toChannel: number
			toLayer: number
			type: string
			frames: number
			play: boolean
			hold: boolean
		}
	}
	clear_layer: {
		options: {
			server: string
			channel: number
			layer: number
		}
	}
	clear_channel: {
		options: {
			server: string
			channel: number
		}
	}
	amcp: {
		options: {
			server: string
			command: string
		}
		result: string
	}
}

const ENTRY_COMMANDS: DropdownChoice<string>[] = [
	{ id: 'play', label: 'Play' },
	{ id: 'playNow', label: 'Play now' },
	{ id: 'load', label: 'Load, paused' },
	{ id: 'pause', label: 'Pause / resume' },
	{ id: 'stop', label: 'Stop' },
	{ id: 'next', label: 'Next' },
	{ id: 'prev', label: 'Previous' },
	{ id: 'back', label: 'Back (skip length)' },
	{ id: 'forward', label: 'Forward (skip length)' },
	{ id: 'update', label: 'Update template' },
	{ id: 'invoke', label: 'Invoke template' },
	{ id: 'clear', label: 'Clear' },
]

const LAYER_COMMANDS: DropdownChoice<string>[] = [
	{ id: 'play', label: 'Play' },
	{ id: 'pause', label: 'Pause' },
	{ id: 'toggle', label: 'Play / pause' },
	{ id: 'stop', label: 'Stop' },
	{ id: 'start', label: 'Go to the start' },
	{ id: 'back', label: 'Back (skip length)' },
	{ id: 'forward', label: 'Forward (skip length)' },
	{ id: 'next', label: 'Next clip in the playlist' },
	{ id: 'prev', label: 'Previous clip in the playlist' },
]

const list = (choices: DropdownChoice<string>[]) => `One of: ${choices.map((c) => c.id).join(', ')}`

function channel<K extends string>(id: K, label: string, value: number): CompanionInputFieldNumber<K> {
	return { id, type: 'number', label, default: value, min: 1, max: 99, asInteger: true }
}

function layer<K extends string>(id: K, label: string, value: number): CompanionInputFieldNumber<K> {
	return { id, type: 'number', label, default: value, min: 0, max: 9999, asInteger: true }
}

export function UpdateActions(self: ModuleInstance): void {
	const entries = entryChoices(self)
	const servers = serverChoices(self)
	const entry = {
		id: 'entry',
		type: 'dropdown',
		label: 'Rundown entry',
		description: 'Choose one, or type a remote ID or label',
		choices: entries,
		default: entries[0]?.id ?? '',
		allowCustom: true,
		expressionDescription: 'The remote ID or label of an entry in an open rundown',
	} as const
	const server = {
		id: 'server',
		type: 'dropdown',
		label: 'CasparCG server',
		choices: servers,
		default: '',
		allowCustom: true,
		expressionDescription: 'The name of a server in CasparCG Client. Empty = the first one',
	} as const
	const amcp: CompanionInputFieldTextInput<'command'> = {
		id: 'command',
		type: 'textinput',
		label: 'Command',
		default: '',
		minLength: 1,
		useVariables: true,
		tooltip: 'For example INFO 1',
	}

	self.setActionDefinitions({
		entry: {
			name: 'Rundown: play, load, stop …',
			sortName: 'Rundown 1',
			description:
				'Does to a rundown entry what its buttons in CasparCG Client do. Works for playlists, groups and takes too.',
			options: [
				entry,
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					choices: ENTRY_COMMANDS,
					default: 'play',
					expressionDescription: list(ENTRY_COMMANDS),
				},
			],
			callback: async ({ options }, context) => {
				await self.command('execute', [self.entryId(options.entry), options.command], context.signal)
			},
		},
		mark_used: {
			name: 'Rundown: mark as used or unused',
			sortName: 'Rundown 2',
			options: [
				entry,
				{
					id: 'used',
					type: 'dropdown',
					label: 'Mark as',
					choices: [
						{ id: 'used', label: 'Used' },
						{ id: 'unused', label: 'Unused' },
					],
					default: 'unused',
					expressionDescription: 'One of: used, unused',
				},
			],
			callback: async ({ options }, context) => {
				await self.command('used', [[self.entryId(options.entry)], options.used === 'used'], context.signal)
			},
		},
		layer: {
			name: 'Layer: play, pause, skip …',
			sortName: 'Layer 1',
			description: 'Controls whatever is on a layer, however it got there.',
			options: [
				server,
				channel('channel', 'Channel', 1),
				layer('layer', 'Layer', 10),
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					choices: LAYER_COMMANDS,
					default: 'toggle',
					expressionDescription: list(LAYER_COMMANDS),
				},
			],
			callback: async ({ options }, context) => {
				const at = { device: self.serverName(options.server), channel: options.channel, layer: options.layer }
				await self.command('transport', [at, options.command], context.signal)
			},
		},
		take: {
			name: 'Take between channels',
			sortName: 'Layer 2',
			description: 'Swaps two layers, so what was on the first is now on the second.',
			options: [
				server,
				channel('fromChannel', 'From channel', 2),
				layer('fromLayer', 'From layer', 10),
				channel('toChannel', 'To channel', 1),
				layer('toLayer', 'To layer', 10),
				{
					id: 'type',
					type: 'dropdown',
					label: 'Type',
					choices: [
						{ id: 'cut', label: 'Cut' },
						{ id: 'fade', label: 'Fade' },
					],
					default: 'cut',
					disableAutoExpression: true,
				},
				{
					id: 'frames',
					type: 'number',
					label: 'Fade frames',
					default: 25,
					min: 1,
					max: 500,
					asInteger: true,
					clampValues: true,
					isVisibleExpression: '$(options:type) == "fade"',
				},
				{ id: 'play', type: 'checkbox', label: 'Play when taken', default: false },
				{ id: 'hold', type: 'checkbox', label: 'Pause what comes off', default: true },
			],
			callback: async ({ options }, context) => {
				const device = self.serverName(options.server)
				const from = { device, channel: options.fromChannel, layer: options.fromLayer }
				const to = { device, channel: options.toChannel, layer: options.toLayer }
				const how = { fade: options.type === 'fade', roll: options.play, hold: options.hold, frames: options.frames }
				await self.command('take', [from, to, how], context.signal)
			},
		},
		clear_layer: {
			name: 'Clear layer',
			sortName: 'Layer 3',
			options: [server, channel('channel', 'Channel', 1), layer('layer', 'Layer', 10)],
			callback: async ({ options }, context) => {
				const command = `CLEAR ${options.channel}-${options.layer}`
				await self.command('raw', [self.serverName(options.server), command], context.signal)
			},
		},
		clear_channel: {
			name: 'Clear channel',
			sortName: 'Layer 4',
			description: 'Everything on the channel goes off air.',
			options: [server, channel('channel', 'Channel', 1)],
			callback: async ({ options }, context) => {
				await self.command('raw', [self.serverName(options.server), `CLEAR ${options.channel}`], context.signal)
			},
		},
		amcp: {
			name: 'Send a CasparCG command',
			sortName: 'Server 1',
			description: 'Sends an AMCP command to a server. The result is the reply, one line per row.',
			options: [server, amcp],
			hasResult: true,
			callback: async ({ options }, context) => {
				const reply = await self.command('raw', [self.serverName(options.server), options.command], context.signal)
				return Array.isArray(reply) ? reply.join('\n') : ''
			},
		},
	})
}
