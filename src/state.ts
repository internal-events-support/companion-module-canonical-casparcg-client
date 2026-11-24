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

/** What a user calls an entry: its remote ID when it has one, otherwise its label. */
export const refOf = (e: Entry): string => e.remoteId.trim() || e.label.trim() || e.name.trim()
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
	/** Seconds left, or null when nothing is counting down. */
	seconds: number | null
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

	reset(): void {
		this.rundowns = []
		this.live = EMPTY
		this.version = ''
	}

	setRundowns(all: RundownPut[]): void {
		this.rundowns = all.map((x) => x.doc)
	}

	/** Another screen changed, opened or closed rundowns. */
	update(put: RundownPut[], drop: string[]): void {
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
		const out: Found[] = []
		for (const rundown of this.rundowns) {
			for (const entry of rundown.items) {
				if (entry.type !== 'SEPARATOR') out.push({ entry, parent: null, rundown })
				for (const child of entry.items ?? []) {
					if (child.type !== 'SEPARATOR') out.push({ entry: child, parent: entry, rundown })
				}
			}
		}
		return out
	}

	/** By remote ID, or else by label. The first in rundown order wins. */
	find(ref: string): Found | undefined {
		const want = ref.trim().toLowerCase()
		if (!want) return undefined
		const all = this.entries()
		return (
			all.find((f) => f.entry.remoteId.trim().toLowerCase() === want) ??
			all.find((f) => (f.entry.label.trim() || f.entry.name.trim()).toLowerCase() === want)
		)
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
		const left = timed ? Math.max(0, l.end - l.pos) : 0
		return {
			state,
			name: l && l.producer !== 'empty' ? short(l.name) || l.producer : '',
			left: timed ? clock(left) : '',
			seconds: timed && state === 'playing' && !l.loop ? left : null,
			elapsed: timed ? clock(l.end - l.start - left) : '',
			duration: timed ? clock(l.end - l.start) : '',
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
		const s = this.live.items[f.entry.id]?.state
		if (s !== 'playing' && s !== 'paused' && s !== 'loaded') return 'empty'
		if (s === 'playing' && TIMED.includes(f.entry.type) && layerState(this.layer(this.place(f))) === 'ended')
			return 'ended'
		return s
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
