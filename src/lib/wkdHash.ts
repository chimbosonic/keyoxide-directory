import { createHash } from 'node:crypto'
import { HASH_LENGTH, ZBASE32_ALPHABET } from './wkd.ts'

/**
 * Computes the WKD hash for an address, for the `wkd-hash` helper script.
 *
 * This is deliberately not part of the runtime: the browser reads a ready-made
 * hash out of keys.json and never sees an address, so no digest code belongs in
 * the bundle. It uses node:crypto for that reason and runs only in node.
 */

/**
 * z-base-32, the human-oriented base32 from Zooko's zbase32 — it drops l, v, 0
 * and 2 as easily confused, which is why a WKD hash never contains them.
 *
 * Bits are taken most-significant first, and a trailing partial group is padded
 * with zero bits rather than an `=` character.
 */
export function zbase32(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ZBASE32_ALPHABET[(buffer >>> bits) & 31]
    }
  }

  if (bits > 0) out += ZBASE32_ALPHABET[(buffer << (5 - bits)) & 31]
  return out
}

export interface WkdIdentity {
  domain: string
  hash: string
}

/**
 * Splits an address and hashes its local part the way WKD prescribes: the local
 * part lowercased, SHA-1'd, then z-base-32 encoded. The domain is lowercased but
 * otherwise untouched, since the URL is built from it directly.
 *
 * SHA-1 is not a security choice here and its collision weakness is irrelevant:
 * the spec fixes it, and the value is an addressing scheme, not a commitment.
 */
export function wkdHash(address: string): WkdIdentity {
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) {
    throw new Error(`not an address: ${address}`)
  }

  const localPart = address.slice(0, at).toLowerCase()
  const domain = address.slice(at + 1).toLowerCase()
  const digest = createHash('sha1').update(localPart, 'utf8').digest()

  return { domain, hash: zbase32(new Uint8Array(digest)).slice(0, HASH_LENGTH) }
}
