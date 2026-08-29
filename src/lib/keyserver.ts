import type { HkpEntry } from './validateKeys'

/**
 * Where `hkp` entries are resolved. keys.openpgp.org answers every VKS endpoint
 * with `access-control-allow-origin: *`, which is what makes a backend-free
 * directory possible at all.
 *
 * The entry type is named `hkp` after Keyoxide's own URL vocabulary, but the
 * transport below is VKS, keys.openpgp.org's own REST interface, not the HKP
 * protocol.
 *
 * There is no route here for a `wkd` entry, and no fallback from one to the
 * other: VKS can only look a key up by fingerprint or by a plaintext address,
 * and a WKD entry stores neither.
 */
export const KEYSERVER = 'https://keys.openpgp.org'

export type KeyFetchResult =
  | { status: 'ok'; armored: string }
  | { status: 'not-found' }
  | { status: 'fetch-error'; reason: string }

export interface FetchOptions {
  fetch?: typeof globalThis.fetch
  base?: string
}

/** Builds the VKS lookup URL for an entry. */
export function keyUrl(entry: HkpEntry, base: string = KEYSERVER): string {
  const root = `${base.replace(/\/+$/, '')}/vks/v1`

  // VKS splits these: 40 hex characters is a fingerprint, 16 is a long key id.
  const endpoint = entry.fingerprint.length === 40 ? 'by-fingerprint' : 'by-keyid'
  return `${root}/${endpoint}/${entry.fingerprint.toUpperCase()}`
}

/**
 * Fetches one armored key. A 404 is an expected outcome (the operator never
 * published, or published elsewhere) and is reported separately from a network
 * or CORS failure, because the two mean different things on the rendered card.
 */
export async function fetchKey(
  entry: HkpEntry,
  options: FetchOptions = {},
): Promise<KeyFetchResult> {
  const doFetch = options.fetch ?? globalThis.fetch
  const url = keyUrl(entry, options.base ?? KEYSERVER)

  let response: Response
  try {
    response = await doFetch(url, { headers: { Accept: 'application/pgp-keys' } })
  } catch (error) {
    return { status: 'fetch-error', reason: error instanceof Error ? error.message : String(error) }
  }

  if (response.status === 404) return { status: 'not-found' }
  if (!response.ok) {
    return { status: 'fetch-error', reason: `keyserver responded ${response.status}` }
  }

  try {
    return { status: 'ok', armored: await response.text() }
  } catch (error) {
    return { status: 'fetch-error', reason: error instanceof Error ? error.message : String(error) }
  }
}
