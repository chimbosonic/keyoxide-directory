/**
 * Whether a deployment answered. Deliberately three-valued: a deployment that
 * is healthy but does not send CORS headers must not be reported as down.
 */
export type Liveness = 'online' | 'unreachable' | 'unknown'

export interface ProbeOptions {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export const DEFAULT_PROBE_TIMEOUT_MS = 5000

/**
 * Probes a deployment with a no-cors request. The response is opaque — we can
 * read nothing from it, not even the status — but that is enough: the request
 * only resolves if something answered at that address, and only rejects when
 * the connection itself failed. That gives a reachability signal without the
 * deployment having to opt into CORS for us.
 *
 * A timeout is reported as unknown rather than unreachable, because a slow
 * deployment is not a dead one.
 */
export async function probeInstance(
  url: string,
  options: ProbeOptions = {},
): Promise<Liveness> {
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS

  try {
    await doFetch(url, {
      mode: 'no-cors',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return 'online'
  } catch (error) {
    return isTimeout(error) ? 'unknown' : 'unreachable'
  }
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  return name === 'TimeoutError' || name === 'AbortError'
}

/** Probes every deployment concurrently, keyed by the URL that was probed. */
export async function probeAll(
  urls: readonly string[],
  options: ProbeOptions = {},
): Promise<Record<string, Liveness>> {
  const entries = await Promise.all(
    urls.map(async (url) => [url, await probeInstance(url, options)] as const),
  )
  return Object.fromEntries(entries)
}
