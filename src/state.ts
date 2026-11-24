// What CasparCG Client says, and what can be worked out from it. Nothing here talks to the client.

export type Entry = {
	id: string
	type: string
	label: string
	name: string
	device: string
	channel: number
	layer: number
	remoteId: string
	props: Record<string, unknown>
	items?: Entry[]
}
export type Rundown = { id: string; name: string; items: Entry[] }
export type RundownPut = { doc: Rundown; rev: number }

export type Layer = {
	producer: string
	name: string
	pos: number
	start: number
	end: number
	paused: boolean
	loop: boolean
	next: string
}
export type Deck = {
	device: string
	channel: number
	layer: number
	playlistId: string
	label: string
	index: number
	count: number
}
export type Server = { name: string; connected: boolean; version: string; channels: string[] }
export type LiveState = {
	devices: Server[]
	layers: Record<string, Layer>
	decks: Deck[]
	items: Record<string, { state: string; used: boolean }>
}

export type PlayState = 'playing' | 'paused' | 'loaded' | 'ended' | 'empty'
export type Place = { device: string; channel: number; layer: number }
export type Found = { entry: Entry; parent: Entry | null; rundown: Rundown }

const EMPTY: LiveState = { devices: [], layers: {}, decks: [], items: {} }
const TIMED = ['MOVIE', 'AUDIO', 'PLAYLIST']
/** Entries that put one thing on one layer. */
export const ON_LAYER = [
	'MOVIE',
	'AUDIO',
	'STILL',
	'TEMPLATE',
	'HTML',
	'SOLIDCOLOR',
	'IMAGESCROLLER',
	'ROUTECHANNEL',
	'ROUTEVIDEOLAYER',
	'DECKLINKINPUT',
]
const LOADABLE = [...ON_LAYER, 'PLAYLIST', 'GROUP']
/** A Playout Command presses a button on the screen that plays it, so it does nothing from here. */
const LEFT_OUT = ['SEPARATOR', 'PLAYOUTCOMMAND']
/** What is on a layer when it is not a file. */
const PRODUCERS: Record<string, string> = {
	color: 'Colour',
	decklink: 'DeckLink input',
	html: 'HTML page',
	image: 'Image',
	ndi: 'NDI source',
	route: 'Route',
}

export const canLoad = (e: Entry): boolean => LOADABLE.includes(e.type)
export const labelOf = (e: Entry): string => e.label.trim() || e.name.trim()

/** What a user calls an entry: its remote ID when it has one, otherwise its label. */
export const refOf = (e: Entry): string => e.remoteId.trim() || labelOf(e)
export const short = (name: string): string => name.replace(/\\/g, '/').split('/').pop() ?? ''

/** Minutes and seconds, or hours when there are any. Rounded up, like a countdown. */
export function clock(seconds: number): string {
	const n = Math.max(0, Math.ceil(seconds - 0.05))
	const two = (x: number) => String(x).padStart(2, '0')
	const mmss = `${two(Math.floor((n % 3600) / 60))}:${two(n % 60)}`
	return n >= 3600 ? `${Math.floor(n / 3600)}:${mmss}` : mmss
}

export function layerState(l: Layer | undefined): PlayState {
	if (!l || l.producer === 'empty') return 'empty'
	if (!l.end) return l.paused ? 'paused' : 'playing'
	if (!l.loop && l.end - l.pos <= 0.05) return 'ended'
	if (l.paused) return l.pos - l.start < 0.1 ? 'loaded' : 'paused'
	return 'playing'
}

export type LayerInfo = {
	state: PlayState
	name: string
	left: string
	/** Whole seconds left, or null for something without a length. */
	seconds: number | null
	/** Counting down to its end: playing, and not looping. */
	counting: boolean
	elapsed: string
	duration: string
	next: string
	playlist: string
	clip: string
}

export class ClientState {
	rundowns: Rundown[] = []
	live: LiveState = EMPTY
	version = ''
	#entries: Found[] | null = null
	#names = new Map<string, Found>()

	reset(): void {
		this.rundowns = []
		this.live = EMPTY
		this.version = ''
		this.#entries = null
	}

	/** The connection is gone: nothing is known about what is playing. */
	lost(): void {
		this.live = { ...EMPTY, devices: this.live.devices.map((server) => ({ ...server, connected: false })) }
	}

	setRundowns(all: RundownPut[]): void {
		this.rundowns = all.map((x) => x.doc)
		this.#entries = null
	}

	/** Another screen changed, opened or closed rundowns. */
	update(put: RundownPut[], drop: string[]): void {
		this.#entries = null
		this.rundowns = this.rundowns.filter((r) => !drop.includes(r.id))
		for (const { doc } of put) {
			const at = this.rundowns.findIndex((r) => r.id === doc.id)
			if (at >= 0) this.rundowns[at] = doc
			else this.rundowns.push(doc)
		}
	}

	/** The server used when none is named: the first one in the client's settings. */
	server(name = ''): string {
		return name || this.live.devices[0]?.name || ''
	}

	/** Every entry that does something, in rundown order. */
	entries(): Found[] {
		if (this.#entries) return this.#entries
		const out: Found[] = []
		for (const rundown of this.rundowns) {
			for (const entry of rundown.items) {
				if (!LEFT_OUT.includes(entry.type)) out.push({ entry, parent: null, rundown })
				for (const child of entry.items ?? []) {
					if (!LEFT_OUT.includes(child.type)) out.push({ entry: child, parent: entry, rundown })
				}
			}
		}
		// Remote IDs first, then labels of entries without one, then labels of the rest. The first of each wins.
		this.#names = new Map()
		const add = (name: string, found: Found) => {
			const key = name.trim().toLowerCase()
			if (key && !this.#names.has(key)) this.#names.set(key, found)
		}
		for (const f of out) add(f.entry.remoteId, f)
		for (const f of out) if (!f.entry.remoteId.trim()) add(labelOf(f.entry), f)
		for (const f of out) add(labelOf(f.entry), f)
		this.#entries = out
		return out
	}

	/** By remote ID, or else by label. */
	find(ref: string): Found | undefined {
		this.entries()
		return this.#names.get(String(ref).trim().toLowerCase())
	}

	/** Entries that are reached by the name they are offered under. */
	reachable(): Found[] {
		return this.entries().filter((f) => this.find(refOf(f.entry))?.entry === f.entry)
	}

	deckAt(p: Place): Deck | undefined {
		return this.live.decks.find((d) => d.device === p.device && d.channel === p.channel && d.layer === p.layer)
	}

	layer(p: Place): Layer | undefined {
		return this.live.layers[`${p.device}|${p.channel}-${p.layer}`]
	}

	layerInfo(p: Place): LayerInfo {
		const l = this.layer(p)
		const deck = this.deckAt(p)
		const state = layerState(l)
		const timed = !!l?.end
		// Whole seconds, so that played and left always add up to the length.
		const left = timed ? Math.max(0, Math.ceil(l.end - l.pos - 0.05)) : 0
		const length = timed ? Math.max(left, Math.ceil(l.end - l.start - 0.05)) : 0
		return {
			state,
			name: l && l.producer !== 'empty' ? short(l.name) || PRODUCERS[l.producer] || l.producer : '',
			left: timed ? clock(left) : '',
			seconds: timed ? left : null,
			counting: timed && state === 'playing' && !l.loop,
			elapsed: timed ? clock(length - left) : '',
			duration: timed ? clock(length) : '',
			next: l?.next ? short(l.next) : '',
			playlist: deck?.label ?? '',
			clip: deck ? `${deck.index + 1}/${deck.count}` : '',
		}
	}

	/** Where an entry plays. A playlist that has been taken to another channel is followed there. */
	place({ entry, parent }: Found): Place {
		const list = entry.type === 'PLAYLIST' ? entry : parent?.type === 'PLAYLIST' ? parent : null
		const deck = list ? this.live.decks.find((d) => d.playlistId === list.id) : undefined
		if (deck) return { device: deck.device, channel: deck.channel, layer: deck.layer }
		const at = list ?? entry
		return { device: this.server(at.device), channel: at.channel, layer: at.layer }
	}

	entryState(f: Found): PlayState {
		if (f.entry.type === 'GROUP') return this.#groupState(f)
		const s = this.live.items[f.entry.id]?.state
		if (s !== 'playing' && s !== 'paused' && s !== 'loaded') return 'empty'
		const ended = TIMED.includes(f.entry.type) && layerState(this.layer(this.place(f))) === 'ended'
		return s !== 'loaded' && ended ? 'ended' : s
	}

	/** The liveliest state of what is in it. */
	#groupState({ entry, rundown }: Found): PlayState {
		const inside = (entry.items ?? []).map((child) => this.entryState({ entry: child, parent: entry, rundown }))
		const order: PlayState[] = ['playing', 'paused', 'loaded', 'ended']
		return order.find((s) => inside.includes(s)) ?? 'empty'
	}

	entryUsed(f: Found): boolean {
		return !!this.live.items[f.entry.id]?.used
	}

	/** Time left on the clip, when the entry is what is on its layer. */
	entryLeft(f: Found): string {
		if (!TIMED.includes(f.entry.type) || this.entryState(f) === 'empty') return ''
		return this.layerInfo(this.place(f)).left
	}
}
