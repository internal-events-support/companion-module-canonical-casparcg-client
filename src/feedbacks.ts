import { combineRgb, type DropdownChoice } from '@companion-module/base'
import { channelField, entryField, layerField, listIds, serverField } from './choices.js'
import type ModuleInstance from './main.js'
import type { PlayState } from './state.js'

type LayerOptions = {
	server: string
	channel: number
	layer: number
}

export type FeedbacksSchema = {
	entry_state: {
		type: 'boolean'
		options: {
			entry: string
			state: string
		}
	}
	entry_used: {
		type: 'boolean'
		options: {
			entry: string
		}
	}
	entry_left: {
		type: 'value'
		options: {
			entry: string
		}
	}
	layer_state: {
		type: 'boolean'
		options: LayerOptions & {
			state: string
		}
	}
	layer_clip: {
		type: 'boolean'
		options: LayerOptions & {
			name: string
		}
	}
	layer_left: {
		type: 'boolean'
		options: LayerOptions & {
			seconds: number
		}
	}
	layer_value: {
		type: 'value'
		options: LayerOptions & {
			property: string
		}
	}
	server_connected: {
		type: 'boolean'
		options: {
			server: string
		}
	}
}

const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 140, 60)
const AMBER = combineRgb(200, 110, 0)
const RED = combineRgb(190, 0, 0)

const STATES: (DropdownChoice<string> & { id: PlayState })[] = [
	{ id: 'playing', label: 'Playing' },
	{ id: 'paused', label: 'Paused' },
	{ id: 'loaded', label: 'Loaded, not started' },
	{ id: 'ended', label: 'Ended' },
	{ id: 'empty', label: 'Not on a layer / empty' },
]

const PROPERTIES: DropdownChoice<string>[] = [
	{ id: 'name', label: 'Clip name' },
	{ id: 'state', label: 'State' },
	{ id: 'left', label: 'Time left' },
	{ id: 'seconds', label: 'Time left in seconds, as a number' },
	{ id: 'elapsed', label: 'Time played' },
	{ id: 'duration', label: 'Length' },
	{ id: 'next', label: 'Next clip' },
	{ id: 'playlist', label: 'Playlist' },
	{ id: 'clip', label: 'Clip number in the playlist' },
]

export function UpdateFeedbacks(self: ModuleInstance): void {
	const entry = entryField(self)
	const state = {
		id: 'state',
		type: 'dropdown',
		label: 'State',
		choices: STATES,
		default: 'playing',
		expressionDescription: listIds(STATES),
	} as const
	const server = serverField(self)
	const place = [server, channelField('channel', 'Channel', 1), layerField('layer', 'Layer', 10)]
	const layer = (o: LayerOptions) =>
		self.state.layerInfo({ device: self.state.server(o.server), channel: o.channel, layer: o.layer })

	self.setFeedbackDefinitions({
		entry_state: {
			type: 'boolean',
			name: 'Rundown: entry is playing, loaded …',
			sortName: 'Rundown 1',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [entry, state],
			callback: ({ options }) => {
				const found = self.state.find(options.entry)
				return !!found && self.state.entryState(found) === options.state
			},
		},
		entry_used: {
			type: 'boolean',
			name: 'Rundown: entry is marked as used',
			sortName: 'Rundown 2',
			defaultStyle: { color: combineRgb(130, 130, 130) },
			options: [entry],
			callback: ({ options }) => {
				const found = self.state.find(options.entry)
				return !!found && self.state.entryUsed(found)
			},
		},
		entry_left: {
			type: 'value',
			name: 'Rundown: time left on an entry',
			sortName: 'Rundown 3',
			description:
				'Time left on the clip, for example 01:25. Empty when the entry is not on a layer. For videos, audio and playlists.',
			options: [entry],
			callback: ({ options }) => {
				const found = self.state.find(options.entry)
				return found ? self.state.entryLeft(found) : ''
			},
		},
		layer_state: {
			type: 'boolean',
			name: 'Layer: is playing, paused, empty …',
			sortName: 'Layer 1',
			description: 'Only videos and audio can be loaded or ended. Anything else is playing or paused.',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [...place, state],
			callback: ({ options }) => layer(options).state === options.state,
		},
		layer_clip: {
			type: 'boolean',
			name: 'Layer: a certain clip is on it',
			sortName: 'Layer 2',
			defaultStyle: { bgcolor: AMBER, color: WHITE },
			options: [
				...place,
				{
					id: 'name',
					type: 'textinput',
					label: 'Clip name',
					description: 'Without its folder. For videos and audio',
					default: '',
					useVariables: true,
				},
			],
			callback: ({ options }) => {
				const want = options.name.trim().toLowerCase()
				return want !== '' && layer(options).name.toLowerCase() === want
			},
		},
		layer_left: {
			type: 'boolean',
			name: 'Layer: less than a certain time left',
			sortName: 'Layer 3',
			description: 'Only while a clip is playing that does not loop.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				...place,
				{ id: 'seconds', type: 'number', label: 'Seconds', default: 10, min: 1, max: 3600, clampValues: true },
			],
			callback: ({ options }) => {
				const { seconds, counting } = layer(options)
				return counting && seconds !== null && seconds <= options.seconds
			},
		},
		layer_value: {
			type: 'value',
			name: 'Layer: clip name, time left …',
			sortName: 'Layer 4',
			options: [
				...place,
				{
					id: 'property',
					type: 'dropdown',
					label: 'Show',
					choices: PROPERTIES,
					default: 'left',
					expressionDescription: listIds(PROPERTIES),
				},
			],
			callback: ({ options }) => {
				const info = layer(options)
				switch (options.property) {
					case 'name':
					case 'state':
					case 'left':
					case 'seconds':
					case 'elapsed':
					case 'duration':
					case 'next':
					case 'playlist':
					case 'clip':
						return info[options.property]
					default:
						return ''
				}
			},
		},
		server_connected: {
			type: 'boolean',
			name: 'CasparCG server is connected',
			sortName: 'Server 1',
			description:
				'Whether CasparCG Client is connected to its server, not whether Companion is connected to the client.',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [server],
			callback: ({ options }) => {
				const name = self.state.server(options.server)
				return self.state.live.devices.some((s) => s.name === name && s.connected)
			},
		},
	})
}
