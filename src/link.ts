import { randomBytes } from 'node:crypto'
import { isIPv6 } from 'node:net'

/** Why the link is not up, so the module can show the right status. */
export type LinkState = 'connecting' | 'ok' | 'failed' | 'wrongCode' | 'tooOld'

export type LinkHandlers = {
	state: (state: LinkState, message?: string) => void
	message: (name: string, args: unknown[]) => void
	/** Signed in and listening: everything has to be read again. */
	ready: () => Promise<void>
}

type Reply = { ok: boolean; value?: unknown; error?: string }

const RETRY = 3000
/** The client allows five wrong codes a minute. */
const RETRY_LIMITED = 65000
/** The client sends something at least every 10 seconds. */
const SILENCE = 25000

class LinkError extends Error {
	constructor(
		readonly state: LinkState,
		message: string,
		readonly retry = RETRY,
	) {
		super(message)
	}
}

/** The connection to CasparCG Advanced Client's web interface: sign in, live events, and calls. */
export class Link {
	readonly #base: string
	readonly #code: string
	readonly #on: LinkHandlers
	readonly #id = randomBytes(10).toString('hex')
	#cookie = ''
	#abort: AbortController | null = null
	#retryTimer: NodeJS.Timeout | null = null
	#silenceTimer: NodeJS.Timeout | null = null
	#stopped = false

	constructor(host: string, port: number, code: string, on: LinkHandlers) {
		// An IPv6 address needs brackets in a URL.
		this.#base = `http://${isIPv6(host) ? `[${host}]` : host}:${port}`
		this.#code = code
		this.#on = on
	}

	start(): void {
		void this.#run()
	}

	stop(): void {
		this.#stopped = true
		if (this.#retryTimer) clearTimeout(this.#retryTimer)
		if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
		this.#retryTimer = null
		this.#silenceTimer = null
		this.#abort?.abort()
		this.#abort = null
	}

	/** Ask the client to do something. Throws with its explanation when it refuses. */
	async call(name: string, args: unknown[], signal?: AbortSignal): Promise<unknown> {
		const stop = this.#abort?.signal
		if (!stop || !this.#cookie) throw new Error('Not connected to CasparCG Advanced Client')
		let res: Response
		try {
			res = await this.#post('/call', { client: this.#id, name, args }, signal ? AbortSignal.any([stop, signal]) : stop)
		} catch (e) {
			throw new Error(stop.aborted ? 'The connection to CasparCG Advanced Client was lost' : reason(e), { cause: e })
		}
		if (res.status === 401) throw new Error('The access code was changed')
		if (!res.ok) throw new Error(`CasparCG Advanced Client answered ${res.status}`)
		const reply = (await res.json()) as Reply
		if (!reply.ok) throw new Error(reply.error || 'CasparCG Advanced Client refused')
		return reply.value
	}

	async #post(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
		return fetch(this.#base + path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-VT': '1', Cookie: this.#cookie },
			body: JSON.stringify(body),
			signal,
		})
	}

	async #run(): Promise<void> {
		const abort = new AbortController()
		this.#abort = abort
		let wait = RETRY
		try {
			this.#on.state('connecting')
			this.#silence()
			await this.#signIn(abort.signal)
			await this.#listen(abort.signal)
			throw new LinkError('failed', 'The connection was closed')
		} catch (e) {
			if (this.#stopped) return
			if (e instanceof LinkError) {
				this.#on.state(e.state, e.message)
				wait = e.retry
			} else {
				this.#on.state('failed', abort.signal.aborted ? 'CasparCG Advanced Client stopped answering' : reason(e))
			}
		} finally {
			if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
			this.#silenceTimer = null
			this.#cookie = ''
			abort.abort()
		}
		// A wrong code stays wrong until the settings change.
		if (wait > 0) this.#retryTimer = setTimeout(() => void this.#run(), wait)
	}

	async #signIn(signal: AbortSignal): Promise<void> {
		this.#cookie = ''
		const res = await this.#post('/login', { code: this.#code }, signal)
		if (res.status === 401) throw new LinkError('wrongCode', 'Wrong access code', 0)
		if (res.status === 429)
			throw new LinkError('failed', 'Too many wrong access codes. Trying again soon', RETRY_LIMITED)
		const cookie = /^vt=[0-9a-f]+/.exec(res.headers.get('set-cookie') ?? '')?.[0]
		if (!res.ok || !cookie) throw new LinkError('failed', 'This does not answer like CasparCG Advanced Client')
		this.#cookie = cookie
		// The web interface of version 1.0 has no such page.
		const me = await fetch(`${this.#base}/me`, { headers: { Cookie: cookie }, signal })
		if (!me.ok) throw new LinkError('tooOld', 'CasparCG Advanced Client 1.1.0 or later is needed', 30000)
		await me.body?.cancel()
	}

	async #listen(signal: AbortSignal): Promise<void> {
		const res = await fetch(`${this.#base}/events?c=${this.#id}`, { headers: { Cookie: this.#cookie }, signal })
		if (!res.ok || !res.body) throw new LinkError('failed', `CasparCG Advanced Client answered ${res.status}`)
		const text = new TextDecoder()
		let buffer = ''
		for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
			this.#silence()
			buffer += text.decode(chunk, { stream: true })
			let end: number
			while ((end = buffer.indexOf('\n\n')) >= 0) {
				const event = buffer.slice(0, end)
				buffer = buffer.slice(end + 2)
				await this.#event(event)
			}
		}
	}

	async #event(event: string): Promise<void> {
		const data = event
			.split('\n')
			.filter((line) => line.startsWith('data: '))
			.map((line) => line.slice(6))
			.join('\n')
		if (!data) return
		let parsed: unknown
		try {
			parsed = JSON.parse(data)
		} catch {
			return // not something this version of the module knows
		}
		if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') return
		const [name, ...args] = parsed as [string, ...unknown[]]
		if (name === 'hello') {
			await this.#on.ready()
			this.#on.state('ok')
		} else this.#on.message(name, args)
	}

	/** Give up on a connection that has gone quiet. */
	#silence(): void {
		if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
		if (this.#stopped) return
		this.#silenceTimer = setTimeout(() => this.#abort?.abort(), SILENCE)
	}
}

function reason(e: unknown): string {
	const cause = e instanceof Error && e.cause instanceof Error ? e.cause : e
	const code = (cause as { code?: unknown }).code
	if (code === 'ECONNREFUSED') return 'Nothing is listening there. Is the web interface on?'
	if (code === 'ENOTFOUND') return 'That address was not found'
	const text = cause instanceof Error ? cause.message : String(cause)
	return text || (typeof code === 'string' ? code : 'The connection failed')
}
