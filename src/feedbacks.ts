import { combineRgb, type DropdownChoice } from '@companion-module/base'
import { entryChoices, serverChoices } from './choices.js'
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

export const FEEDBACKS = [
	'entry_state',
	'entry_used',
	'entry_left',
	'layer_state',
	'layer_clip',
	'layer_left',
	'layer_value',
	'server_connected',
] as const satisfies (keyof FeedbacksSchema)[]

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
	{ id: 'elapsed', label: 'Time played' },
	{ id: 'duration', label: 'Length' },
	{ id: 'next', label: 'Next clip' },
	{ id: 'playlist', label: 'Playlist' },
	{ id: 'clip', label: 'Clip number in the playlist' },
]

const list = (choices: DropdownChoice<string>[]) => `One of: ${choices.map((c) => c.id).join(', ')}`

export function UpdateFeedbacks(self: ModuleInstance): void {
	const entries = entryChoices(self)
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
	const state = {
		id: 'state',
		type: 'dropdown',
		label: 'State',
		choices: STATES,
		default: 'playing',
		expressionDescription: list(STATES),
	} as const
	const place = [
		{
			id: 'server',
			type: 'dropdown',
			label: 'CasparCG server',
			choices: serverChoices(self),
			default: '',
			allowCustom: true,
			expressionDescription: 'The name of a server in CasparCG Client. Empty = the first one',
		},
		{ id: 'channel', type: 'number', label: 'Channel', default: 1, min: 1, max: 99, asInteger: true },
		{ id: 'layer', type: 'number', label: 'Layer', default: 10, min: 0, max: 9999, asInteger: true },
	] as const
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
			description: 'Time left on the clip, for example 01:25. Empty when the entry is not loaded or playing.',
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
					description: 'Without its folder',
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
				const { seconds } = layer(options)
				return seconds !== null && seconds <= options.seconds
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
					expressionDescription: list(PROPERTIES),
				},
			],
			callback: ({ options }) => {
				const info = layer(options)
				switch (options.property) {
					case 'name':
					case 'state':
					case 'left':
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
			options: [place[0]],
			callback: ({ options }) => {
				const name = self.state.server(options.server)
				return self.state.live.devices.some((s) => s.name === name && s.connected)
			},
		},
	})
}
