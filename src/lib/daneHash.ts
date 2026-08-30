import { createHash } from 'node:crypto'
import { HASH_LENGTH } from './dane.ts'

/**
 * Computes the DANE hash for an address, for the `dane-hash` helper script.
 *
 * Like `wkdHash`, this is deliberately not part of the runtime: the browser
 * reads a ready-made hash out of keys.json and never sees an address, so no
 * digest code belongs in the bundle. It uses node:crypto for that reason.
 */

export interface DaneIdentity {
  domain: string
  hash: string
}

/**
 * Splits an address and hashes its local part the way RFC 7929 prescribes: the
 * local part lowercased, SHA-256'd, truncated to the leftmost 28 octets, and
 * written as lowercase hex.
 *
 * A better digest than WKD's SHA-1, and worth no more as a secret: it is still
 * unsalted, still beside the domain in the clear, and still no obstacle to
 * anyone running a wordlist of common local parts.
 */
export function daneHash(address: string): DaneIdentity {
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) {
    throw new Error(`not an address: ${address}`)
  }

  const localPart = address.slice(0, at).toLowerCase()
  const domain = address.slice(at + 1).toLowerCase()
  const digest = createHash('sha256').update(localPart, 'utf8').digest('hex')

  return { domain, hash: digest.slice(0, HASH_LENGTH) }
}
