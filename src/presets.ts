import {
	combineRgb,
	type CompanionPresetDefinitions,
	type CompanionPresetGroup,
	type CompanionPresetSection,
	type CompanionSimplePresetDefinition,
} from '@companion-module/base'
import { entryChoices } from './choices.js'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import { canLoad, refOf } from './state.js'

type Preset = CompanionSimplePresetDefinition<ModuleSchema>

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const GREY = combineRgb(50, 50, 50)
const GREEN = combineRgb(0, 140, 60)
const AMBER = combineRgb(200, 110, 0)
const RED = combineRgb(190, 0, 0)

const CHANNEL = { isExpression: true, value: '$(local:channel)' } as const
const LAYER = { isExpression: true, value: '$(local:layer)' } as const
const FROM = { isExpression: true, value: '$(local:from)' } as const
const TO = { isExpression: true, value: '$(local:to)' } as const
const ENTRY = { isExpression: true, value: '$(local:entry)' } as const

/** The layer the client uses for clips unless told otherwise. */
const MAIN_LAYER = 10

const style = (text: string, bgcolor = BLACK): Preset['style'] => ({ text, size: 'auto', color: WHITE, bgcolor })
const at = (): NonNullable<Preset['localVariables']> => [
	{ variableType: 'simple', variableName: 'channel', startupValue: 1 },
	{ variableType: 'simple', variableName: 'layer', startupValue: MAIN_LAYER },
]

const TAKES = [
	{ id: 'cut', name: 'Cut', type: 'cut', play: false },
	{ id: 'cut_play', name: 'Cut and play', type: 'cut', play: true },
	{ id: 'fade', name: 'Fade', type: 'fade', play: false },
	{ id: 'fade_play', name: 'Fade and play', type: 'fade', play: true },
] as const

const LAYER_BUTTONS = [
	{ id: 'stop', name: 'Stop', text: '⏹' },
	{ id: 'play', name: 'Play', text: '▶' },
	{ id: 'pause', name: 'Pause', text: '⏸' },
	{ id: 'back', name: 'Back', text: '⏪' },
	{ id: 'forward', name: 'Forward', text: '⏩' },
	{ id: 'next', name: 'Next clip', text: '⏭' },
	{ id: 'prev', name: 'Previous clip', text: '⏮' },
] as const

const ENTRY_BUTTONS = [
	{
		id: 'play',
		name: 'Play',
		note: 'Green while it is playing. Takes, mixer entries and commands happen at once, so they never turn green',
	},
	{ id: 'load', name: 'Load', note: 'Amber while it is loaded. Only for entries that can be loaded' },
	{ id: 'stop', name: 'Stop', note: '' },
] as const

function takes(presets: CompanionPresetDefinitions<ModuleSchema>): CompanionPresetSection<ModuleSchema> {
	for (const t of TAKES) {
		presets[`take_${t.id}`] = {
			type: 'simple',
			name: `${t.name}, channel 2 to 1`,
			style: style(`${t.name}\\n$(local:from) > $(local:to)`, t.play ? GREEN : GREY),
			localVariables: [
				{ variableType: 'simple', variableName: 'from', startupValue: 2 },
				{ variableType: 'simple', variableName: 'to', startupValue: 1 },
				{ variableType: 'simple', variableName: 'layer', startupValue: MAIN_LAYER },
			],
			steps: [
				{
					down: [
						{
							actionId: 'take',
							options: {
								server: '',
								fromChannel: FROM,
								fromLayer: LAYER,
								toChannel: TO,
								toLayer: LAYER,
								type: t.type,
								frames: 25,
								play: t.play,
								hold: true,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}
	return {
		id: 'takes',
		name: 'Takes',
		description: 'The channels and layer are local variables of the button, so they can be changed after adding it',
		definitions: [
			{ id: 'takes_main', type: 'simple', name: 'Channel 2 to channel 1', presets: TAKES.map((t) => `take_${t.id}`) },
		],
	}
}

function layers(
	self: ModuleInstance,
	presets: CompanionPresetDefinitions<ModuleSchema>,
): CompanionPresetSection<ModuleSchema> {
	const count = Math.max(1, self.state.live.devices[0]?.channels.length ?? 1)
	const channels = Array.from({ length: count }, (_, n) => ({ name: `Channel ${n + 1}`, value: n + 1 }))
	const place = { server: '', channel: CHANNEL, layer: LAYER }
	presets['layer_status'] = {
		type: 'simple',
		name: 'Clip and time left',
		style: style('CH $(local:channel)\\n$(local:clip)\\n$(local:left)'),
		localVariables: [
			...at(),
			{
				variableType: 'feedback',
				variableName: 'clip',
				feedbackId: 'layer_value',
				options: { ...place, property: 'name' },
			},
			{
				variableType: 'feedback',
				variableName: 'left',
				feedbackId: 'layer_value',
				options: { ...place, property: 'left' },
			},
		],
		steps: [],
		feedbacks: [
			{
				feedbackId: 'layer_state',
				options: { ...place, state: 'playing' },
				style: { bgcolor: GREEN, color: WHITE },
			},
			{ feedbackId: 'layer_state', options: { ...place, state: 'loaded' }, style: { bgcolor: AMBER, color: WHITE } },
			{ feedbackId: 'layer_left', options: { ...place, seconds: 10 }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	const groups: CompanionPresetGroup<ModuleSchema>[] = [
		{
			id: 'layer_status',
			type: 'template',
			name: 'Clip and time left',
			description: 'Green while playing, amber while loaded, red for the last 10 seconds',
			presetId: 'layer_status',
			templateVariableName: 'channel',
			templateValues: channels,
		},
	]
	for (const b of LAYER_BUTTONS) {
		presets[`layer_${b.id}`] = {
			type: 'simple',
			name: b.name,
			style: style(`CH $(local:channel)\\n${b.text}`),
			localVariables: at(),
			steps: [{ down: [{ actionId: 'layer', options: { ...place, command: b.id } }], up: [] }],
			feedbacks:
				b.id === 'play' || b.id === 'pause'
					? [
							{
								feedbackId: 'layer_state',
								options: { ...place, state: b.id === 'play' ? 'playing' : 'paused' },
								style: { bgcolor: b.id === 'play' ? GREEN : AMBER, color: WHITE },
							},
						]
					: [],
		}
		groups.push({
			id: `layer_${b.id}`,
			type: 'template',
			name: b.name,
			presetId: `layer_${b.id}`,
			templateVariableName: 'channel',
			templateValues: channels,
		})
	}
	return {
		id: 'layers',
		name: 'Channels',
		description: `For layer ${MAIN_LAYER} of each channel of the first server. The channel and layer are local variables of the button`,
		definitions: groups,
	}
}

function rundowns(
	self: ModuleInstance,
	presets: CompanionPresetDefinitions<ModuleSchema>,
): CompanionPresetSection<ModuleSchema>[] {
	if (!entryChoices(self).length) return [] // nothing to make them from
	for (const b of ENTRY_BUTTONS) {
		presets[`entry_${b.id}`] = {
			type: 'simple',
			name: b.name,
			style: style(`${b.name.toUpperCase()}\\n$(local:entry)${b.id === 'play' ? '\\n$(local:left)' : ''}`),
			localVariables: [
				{ variableType: 'simple', variableName: 'entry', startupValue: '' },
				...(b.id === 'play'
					? [
							{
								variableType: 'feedback' as const,
								variableName: 'left',
								feedbackId: 'entry_left' as const,
								options: { entry: ENTRY },
							},
						]
					: []),
			],
			steps: [{ down: [{ actionId: 'entry', options: { entry: ENTRY, command: b.id } }], up: [] }],
			feedbacks: [
				...(b.id === 'stop'
					? []
					: [
							{
								feedbackId: 'entry_state' as const,
								options: { entry: ENTRY, state: b.id === 'play' ? 'playing' : 'loaded' },
								style: { bgcolor: b.id === 'play' ? GREEN : AMBER, color: WHITE },
							},
						]),
			],
		}
	}
	const choices = new Map(entryChoices(self).map((c) => [c.id, c.label]))
	const out: CompanionPresetSection<ModuleSchema>[] = []
	for (const rundown of self.state.rundowns) {
		const values = self.state
			.reachable()
			.filter((f) => f.rundown === rundown)
			.map(({ entry }) => ({ entry, name: choices.get(refOf(entry)), value: refOf(entry) }))
		if (!values.length) continue
		out.push({
			id: `rundown_${rundown.id}`,
			name: rundown.name,
			definitions: ENTRY_BUTTONS.map((b): CompanionPresetGroup<ModuleSchema> => ({
				id: `rundown_${rundown.id}_${b.id}`,
				type: 'template',
				name: b.name,
				description: b.note,
				presetId: `entry_${b.id}`,
				templateVariableName: 'entry',
				templateValues: values
					.filter((v) => b.id !== 'load' || canLoad(v.entry))
					.map(({ name, value }) => ({ name, value })),
			})).filter((g) => g.type !== 'template' || g.templateValues.length > 0),
		})
	}
	return out
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const structure = [takes(presets), layers(self, presets), ...rundowns(self, presets)]
	self.setPresetDefinitions(structure, presets)
}
