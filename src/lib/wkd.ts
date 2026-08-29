import type { KeyMaterial } from './parseKey'

/**
 * Web Key Directory, as defined by draft-koch-openpgp-webkey-service. A key
 * lives at a URL derived from its owner's address: the domain in cleartext, and
 * the local part as a z-base-32 encoded SHA-1.
 *
 * The directory stores only that hash, never the address, which is why nothing
 * here hashes anything — the value arrives ready-made in keys.json. The
 * `scripts/wkd-hash.ts` helper computes it for contributors.
 *
 * Be clear-eyed about what the hash buys: it is an unsalted SHA-1 of a
 * lowercased local part, alongside the domain in the clear. It defeats a
 * scraper's regex, not anyone who cares to run a wordlist.
 */

/** The 32 z-base-32 characters, in encoding order. */
export const ZBASE32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769'

/** A SHA-1 digest is 160 bits, which is exactly 32 z-base-32 characters, unpadded. */
export const HASH_LENGTH = 32

/**
 * The advanced method, tried first. Its dedicated `openpgpkey.` host is what
 * lets an operator publish keys without touching the apex domain's web root.
 */
export function advancedUrl(domain: string, hash: string): string {
  const host = domain.toLowerCase()
  return `https://openpgpkey.${host}/.well-known/openpgpkey/${host}/hu/${hash}`
}

/** The direct method, the fallback: same path, served from the domain itself. */
export function directUrl(domain: string, hash: string): string {
  return `https://${domain.toLowerCase()}/.well-known/openpgpkey/hu/${hash}`
}

/**
 * Both candidate URLs in the order the spec prescribes.
 *
 * The optional `?l=<local-part>` parameter is deliberately absent. It is a hint
 * for servers that map addresses themselves, and including it would put the
 * plaintext address back into the bundle, which is the thing storing a hash is
 * meant to avoid.
 */
export function wkdUrls(domain: string, hash: string): [string, string] {
  return [advancedUrl(domain, hash), directUrl(domain, hash)]
}

export type WkdFetchResult =
  | { status: 'ok'; key: KeyMaterial; url: string }
  | { status: 'not-found' }
  | { status: 'fetch-error'; reason: string }

export interface WkdFetchOptions {
  fetch?: typeof globalThis.fetch
}

/**
 * Fetches a key over WKD, advanced method first.
 *
 * A 404 from the advanced host is the ordinary case for a domain that only
 * publishes directly, so both URLs are tried before reporting not-found. A
 * rejected request is remembered but does not stop the chain either: most
 * domains send no CORS header, and the advanced host frequently does not exist
 * at all, so a failure there says nothing about the direct URL.
 */
export async function fetchWkdKey(
  domain: string,
  hash: string,
  options: WkdFetchOptions = {},
): Promise<WkdFetchResult> {
  const doFetch = options.fetch ?? globalThis.fetch
  let lastError: string | null = null

  for (const url of wkdUrls(domain, hash)) {
    let response: Response
    try {
      response = await doFetch(url, { headers: { Accept: 'application/octet-stream' } })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      continue
    }

    if (response.status === 404) continue
    if (!response.ok) {
      lastError = `${url} responded ${response.status}`
      continue
    }

    try {
      return { status: 'ok', key: new Uint8Array(await response.arrayBuffer()), url }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  // Every URL 404'd: the key is genuinely not published here, which is a
  // different thing from every URL having failed to answer.
  return lastError === null ? { status: 'not-found' } : { status: 'fetch-error', reason: lastError }
}
