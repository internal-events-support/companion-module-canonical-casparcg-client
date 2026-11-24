import {
	combineRgb,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type CompanionPresetGroup,
	type CompanionPresetSection,
} from '@companion-module/base'
import { entryChoices } from './choices.js'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import { canLoad, refOf } from './state.js'

/** Layered, because only those can show the value of a feedback in their text. */
type Preset = CompanionLayeredButtonPresetDefinition<ModuleSchema>
type Elements = Preset['elements']
type Variables = NonNullable<Preset['localVariables']>
type Presets = CompanionPresetDefinitions<ModuleSchema>
type Section = CompanionPresetSection<ModuleSchema>

const WHITE = combineRgb(255, 255, 255)
const SOFT = combineRgb(190, 190, 190)
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
const PLACE = { server: '', channel: CHANNEL, layer: LAYER }

/** CasparCG's usual layer, for when nothing is known yet. */
const USUAL_LAYER = 10

/** A background and up to three lines of text, the middle one large. Text sizes are per cent of their own box. */
function draw(top: string, middle: string, bottom = ''): Elements {
	const line = (id: string, text: string, y: number, height: number, fontsize: number, color: number): Elements[0] => ({
		id,
		type: 'text',
		text,
		x: 3,
		y,
		width: 94,
		height,
		fontsize,
		fontsizeAllowShrink: true,
		color,
		halign: 'center',
		valign: 'center',
	})
	const elements: Elements = [{ id: 'background', type: 'box', x: 0, y: 0, width: 100, height: 100, color: BLACK }]
	elements.push(line('top', top, 3, 25, 72, SOFT))
	elements.push(line('middle', middle, 28, bottom ? 40 : 68, bottom ? 62 : 40, WHITE))
	if (bottom) elements.push(line('bottom', bottom, 68, 29, 88, WHITE))
	return elements
}
/** A feedback changes the background. */
const turns = (color: number) => [
	{ elementId: 'background', elementProperty: 'color', override: { isExpression: false as const, value: color } },
]

const number = (variableName: string, startupValue: number): Variables[0] => ({
	variableType: 'simple',
	variableName,
	startupValue,
})
const shows = (variableName: string, property: string): Variables[0] => ({
	variableType: 'feedback',
	variableName,
	feedbackId: 'layer_value',
	options: { ...PLACE, property },
})
/** Where the button acts, and what it calls its channel. */
const at = (): Variables => [number('channel', 1), number('layer', USUAL_LAYER), shows('title', 'channel')]

const LEFT: Variables[0] = {
	variableType: 'feedback',
	variableName: 'left',
	feedbackId: 'entry_left',
	options: { entry: ENTRY },
}

const TAKES = [
	{ id: 'cut', name: 'Cut', type: 'cut', play: false },
	{ id: 'cut_play', name: 'Cut and play', type: 'cut', play: true },
	{ id: 'fade', name: 'Fade', type: 'fade', play: false },
	{ id: 'fade_play', name: 'Fade and play', type: 'fade', play: true },
] as const

const LAYER_BUTTONS = [
	{ id: 'play', name: 'Play', text: 'PLAY' },
	{ id: 'pause', name: 'Pause', text: 'PAUSE' },
	{ id: 'toggle', name: 'Play / pause', text: 'PLAY / PAUSE' },
	{ id: 'stop', name: 'Stop', text: 'STOP' },
	{ id: 'back', name: 'Back', text: 'BACK' },
	{ id: 'forward', name: 'Forward', text: 'FWD' },
	{ id: 'prev', name: 'Previous clip', text: 'PREV' },
	{ id: 'next', name: 'Next clip', text: 'NEXT' },
] as const

const ENTRY_BUTTONS = [
	{
		id: 'play',
		name: 'Play',
		note: 'Green while it is playing. Takes, mixer entries and commands happen at once, so they never turn green',
		lit: { state: 'playing', color: GREEN },
	},
	{
		id: 'load',
		name: 'Load',
		note: 'Amber while it is loaded. Only for entries that can be loaded',
		lit: { state: 'loaded', color: AMBER },
	},
	{ id: 'stop', name: 'Stop', note: undefined, lit: undefined },
] as const

function rundowns(self: ModuleInstance, presets: Presets): Section[] {
	const reachable = self.state.reachable()
	// Only buttons there is an entry for: Companion warns about presets that are not shown anywhere.
	const buttons = ENTRY_BUTTONS.filter((b) => reachable.some((f) => b.id !== 'load' || canLoad(f.entry)))
	for (const b of buttons) {
		presets[`entry_${b.id}`] = {
			type: 'layered',
			name: b.name,
			elements: draw(b.name.toUpperCase(), '$(local:label)', b.id === 'play' ? '$(local:left)' : ''),
			localVariables: [
				{ variableType: 'simple', variableName: 'entry', startupValue: '' },
				{ variableType: 'feedback', variableName: 'label', feedbackId: 'entry_label', options: { entry: ENTRY } },
				...(b.id === 'play' ? [LEFT] : []),
			],
			steps: [{ down: [{ actionId: 'entry', options: { entry: ENTRY, command: b.id } }], up: [] }],
			feedbacks: b.lit
				? [
						{
							feedbackId: 'entry_state',
							options: { entry: ENTRY, state: b.lit.state },
							styleOverrides: turns(b.lit.color),
						},
					]
				: [],
		}
	}
	const choices = new Map(entryChoices(self).map((c) => [c.id, c.label]))
	return self.state.rundowns.flatMap((rundown): Section[] => {
		const values = reachable
			.filter((f) => f.rundown === rundown)
			.map(({ entry }) => ({ entry, name: choices.get(refOf(entry)), value: refOf(entry) }))
		const groups = buttons
			.map((b) => ({ b, some: values.filter((v) => b.id !== 'load' || canLoad(v.entry)) }))
			.filter(({ some }) => some.length > 0)
			.map(({ b, some }): CompanionPresetGroup<ModuleSchema> => ({
				id: `rundown_${rundown.id}_${b.id}`,
				type: 'template',
				name: b.name,
				description: b.note,
				presetId: `entry_${b.id}`,
				templateVariableName: 'entry',
				templateValues: some.map(({ name, value }) => ({ name, value })),
			}))
		return groups.length ? [{ id: `rundown_${rundown.id}`, name: rundown.name, definitions: groups }] : []
	})
}

/** The channels of the first server. */
const allChannels = (self: ModuleInstance) => {
	const count = Math.max(1, self.state.live.devices[0]?.channels.length ?? 1)
	return Array.from({ length: count }, (_, n) => n + 1)
}
const channelValues = (self: ModuleInstance, channels: number[]) =>
	channels.map((n) => ({ name: `Channel ${self.state.channelText(self.state.server(), n)}`, value: n }))

function layers(self: ModuleInstance, presets: Presets): Section[] {
	let inUse = self.state.layersInUse()
	if (!inUse.size) inUse = new Map([[USUAL_LAYER, allChannels(self)]])
	presets['layer_status'] = {
		type: 'layered',
		name: 'Clip and time left',
		elements: draw('$(local:title)', '$(local:clip)', '$(local:left)'),
		localVariables: [...at(), shows('clip', 'name'), shows('left', 'left')],
		steps: [],
		feedbacks: [
			{ feedbackId: 'layer_state', options: { ...PLACE, state: 'playing' }, styleOverrides: turns(GREEN) },
			{ feedbackId: 'layer_state', options: { ...PLACE, state: 'loaded' }, styleOverrides: turns(AMBER) },
			{ feedbackId: 'layer_left', options: { ...PLACE, seconds: 10 }, styleOverrides: turns(RED) },
		],
	}
	for (const b of LAYER_BUTTONS) {
		const lit = b.id === 'play' ? 'playing' : b.id === 'pause' ? 'paused' : null
		presets[`layer_${b.id}`] = {
			type: 'layered',
			name: b.name,
			elements: draw('$(local:title)', b.text),
			localVariables: at(),
			steps: [{ down: [{ actionId: 'layer', options: { ...PLACE, command: b.id } }], up: [] }],
			feedbacks: lit
				? [
						{
							feedbackId: 'layer_state',
							options: { ...PLACE, state: lit },
							styleOverrides: turns(lit === 'playing' ? GREEN : AMBER),
						},
					]
				: [],
		}
	}
	const kinds = [
		{
			id: 'status',
			name: 'Clip and time left',
			description: 'Green while playing, amber while loaded, red for the last 10 seconds',
		},
		...LAYER_BUTTONS.map(({ id, name }) => ({ id, name, description: undefined })),
	]
	return [...inUse].map(([layer, channels]) => ({
		id: `layer_${layer}`,
		name: `Layer ${layer}`,
		description: 'For the channels that use it. The channel and layer are local variables of the button',
		definitions: kinds.map((kind): CompanionPresetGroup<ModuleSchema> => ({
			id: `layer_${layer}_${kind.id}`,
			type: 'template',
			name: kind.name,
			description: kind.description,
			presetId: `layer_${kind.id}`,
			templateVariableName: 'channel',
			templateValues: channelValues(self, channels),
			commonVariableValues: { layer },
		})),
	}))
}

function takes(presets: Presets): Section {
	for (const t of TAKES) {
		presets[`take_${t.id}`] = {
			type: 'simple',
			name: t.name,
			style: {
				text: `${t.name.toUpperCase()}\\n$(local:from) to $(local:to)`,
				size: 'auto',
				color: WHITE,
				bgcolor: t.play ? GREEN : GREY,
			},
			localVariables: [
				{ variableType: 'simple', variableName: 'from', startupValue: 1 },
				{ variableType: 'simple', variableName: 'to', startupValue: 2 },
				{ variableType: 'simple', variableName: 'layer', startupValue: USUAL_LAYER },
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
		description: 'The channels and the layer are local variables of the button: set them after adding it',
		definitions: [
			{ id: 'takes_any', type: 'simple', name: 'Between two channels', presets: TAKES.map((t) => `take_${t.id}`) },
		],
	}
}

function overlays(self: ModuleInstance, presets: Presets): Section {
	presets['overlay'] = {
		type: 'layered',
		name: 'Playback overlay',
		elements: draw('$(local:title)', 'OVERLAY'),
		localVariables: at(),
		steps: [{ down: [{ actionId: 'overlay', options: { server: '', channel: CHANNEL, overlay: 'toggle' } }], up: [] }],
		feedbacks: [{ feedbackId: 'overlay_on', options: { server: '', channel: CHANNEL }, styleOverrides: turns(GREEN) }],
	}
	return {
		id: 'overlays',
		name: 'Playback overlays',
		description: 'Needs CasparCG Advanced Client 1.2.0 or later',
		definitions: [
			{
				id: 'overlays_channels',
				type: 'template',
				name: 'Show or hide',
				presetId: 'overlay',
				templateVariableName: 'channel',
				templateValues: channelValues(self, allChannels(self)),
			},
		],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: Presets = {}
	const structure = [...rundowns(self, presets), ...layers(self, presets), takes(presets), overlays(self, presets)]
	self.setPresetDefinitions(structure, presets)
}
