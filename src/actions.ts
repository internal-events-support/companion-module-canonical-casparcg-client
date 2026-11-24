import type { CompanionInputFieldTextInput, DropdownChoice } from '@companion-module/base'
import { channelField, entryField, layerField, listIds, serverField } from './choices.js'
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
	mark_all_unused: {
		options: Record<string, never>
	}
	overlay: {
		options: {
			server: string
			channel: string | number
			overlay: string
		}
	}
	layer: {
		options: {
			server: string
			channel: string | number
			layer: number
			command: string
		}
	}
	take: {
		options: {
			server: string
			fromChannel: string | number
			fromLayer: number
			toChannel: string | number
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
			channel: string | number
			layer: number
		}
	}
	clear_channel: {
		options: {
			server: string
			channel: string | number
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

export function UpdateActions(self: ModuleInstance): void {
	const entry = entryField(self)
	const server = serverField(self)
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
				'Does to a rundown entry what its buttons in CasparCG Advanced Client do. Works for playlists, groups and takes too.',
			options: [
				entry,
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					choices: ENTRY_COMMANDS,
					default: 'play',
					expressionDescription: listIds(ENTRY_COMMANDS),
				},
			],
			callback: async ({ options }, context) => {
				await self.command('execute', [self.entryId(options.entry), options.command], context.signal)
			},
		},
		mark_used: {
			name: 'Rundown: mark as used or unused',
			sortName: 'Rundown 2',
			description: 'A group or playlist is marked together with what is in it.',
			options: [
				entry,
				{
					id: 'used',
					type: 'dropdown',
					label: 'Mark as',
					choices: [
						{ id: 'used', label: 'Used' },
						{ id: 'unused', label: 'Unused' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'unused',
					expressionDescription: 'One of: used, unused, toggle',
				},
			],
			callback: async ({ options }, context) => {
				const ids = self.entryIds(options.entry)
				const used = options.used === 'toggle' ? !self.state.allUsed(ids) : options.used === 'used'
				await self.command('used', [ids, used], context.signal)
			},
		},
		mark_all_unused: {
			name: 'Rundown: mark everything as unused',
			sortName: 'Rundown 3',
			description: 'Every entry of every open rundown.',
			options: [],
			callback: async (_, context) => {
				await self.command('used', [self.allIds(), false], context.signal)
			},
		},
		overlay: {
			name: 'Channel: playback overlay',
			sortName: 'Layer 5',
			description:
				'Shows or hides the time left on clips on a channel. It is set up in CasparCG Advanced Client, under Channels.',
			options: [
				server,
				channelField(self, 'channel', 'Channel', 1),
				{
					id: 'overlay',
					type: 'dropdown',
					label: 'Overlay',
					choices: [
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
					expressionDescription: 'One of: show, hide, toggle',
				},
			],
			callback: async ({ options }, context) => {
				const { device, channel } = self.place(options.server, options.channel)
				const on = options.overlay === 'toggle' ? !self.state.overlayOn(device, channel) : options.overlay === 'show'
				try {
					await self.command('channel', [device, channel, { overlay: { on } }], context.signal)
				} catch (e) {
					if (!(e instanceof Error) || e.message !== 'Unknown call channel') throw e
					throw new Error('The playback overlay needs CasparCG Advanced Client 1.2.0 or later', { cause: e })
				}
			},
		},
		layer: {
			name: 'Layer: play, pause, skip …',
			sortName: 'Layer 1',
			description: 'Controls whatever is on a layer, however it got there.',
			options: [
				server,
				channelField(self, 'channel', 'Channel', 1),
				layerField('layer', 'Layer', 10),
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					choices: LAYER_COMMANDS,
					default: 'toggle',
					expressionDescription: listIds(LAYER_COMMANDS),
				},
			],
			callback: async ({ options }, context) => {
				const at = { ...self.place(options.server, options.channel), layer: options.layer }
				await self.command('transport', [at, options.command], context.signal)
			},
		},
		take: {
			name: 'Take between channels',
			sortName: 'Layer 2',
			description: 'Swaps two layers, so what was on the first is now on the second.',
			options: [
				server,
				channelField(self, 'fromChannel', 'From channel', 1),
				layerField('fromLayer', 'From layer', 10),
				channelField(self, 'toChannel', 'To channel', 2),
				layerField('toLayer', 'To layer', 10),
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
				const from = { ...self.place(options.server, options.fromChannel), layer: options.fromLayer }
				const to = { ...self.place(options.server, options.toChannel), layer: options.toLayer }
				const how = { fade: options.type === 'fade', roll: options.play, hold: options.hold, frames: options.frames }
				await self.command('take', [from, to, how], context.signal)
			},
		},
		clear_layer: {
			name: 'Clear layer',
			sortName: 'Layer 3',
			options: [server, channelField(self, 'channel', 'Channel', 1), layerField('layer', 'Layer', 10)],
			callback: async ({ options }, context) => {
				const at = { ...self.place(options.server, options.channel), layer: options.layer }
				await self.clear(at, false, context.signal)
			},
		},
		clear_channel: {
			name: 'Clear channel',
			sortName: 'Layer 4',
			description: 'Everything on the channel goes off air, and its mixer settings are reset.',
			options: [server, channelField(self, 'channel', 'Channel', 1)],
			callback: async ({ options }, context) => {
				await self.clear({ ...self.place(options.server, options.channel), layer: 0 }, true, context.signal)
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
