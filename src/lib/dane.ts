import { OPENPGPKEY, queryDoh, type DohOptions } from './doh.ts'
import type { KeyMaterial } from './parseKey'

/**
 * DANE, as defined by RFC 7929: a key published in DNS as an OPENPGPKEY record,
 * at a name derived from its owner's address — the domain in cleartext, and the
 * local part as a truncated SHA-256.
 *
 * The route exists because of what it does *not* need. WKD runs in the visitor's
 * browser against the operator's own server, so that server has to send
 * `access-control-allow-origin: *`, and many do not; the card then reads "key
 * lookup failed" through no fault of the key. The resolvers this goes through
 * already send that header, because the ownership lookup depends on it.
 *
 * As with WKD, nothing here hashes anything: the value arrives ready-made in
 * keys.json and the browser never sees an address. `scripts/dane-hash.ts`
 * computes it for contributors.
 */

/** The fixed label RFC 7929 puts between the hash and the domain. */
export const RECORD_LABEL = '_openpgpkey'

/** A SHA-256 truncated to 28 octets, written as hex, is 56 characters. */
export const HASH_LENGTH = 56

export function daneName(domain: string, hash: string): string {
  return `${hash.toLowerCase()}.${RECORD_LABEL}.${domain.toLowerCase()}`
}

/** RFC 3597 generic rdata: `\# <length> <hex>`. */
const GENERIC_FORM = /^\\#\s+(\d+)\s+([\s0-9a-fA-F]*)$/

/**
 * Reads the key bytes out of an rdata field, in either form a resolver sends.
 *
 * The two do not agree, and both were captured from the same live record:
 * dns.google returns RFC 3597 generic form, `\# 7328 c6c14d04…`, while
 * cloudflare-dns.com returns presentation form, `( xsFNBGGToPw… )` — base64 in
 * parentheses. Whitespace inside either is stripped rather than trusted to be
 * absent, since wrapping is a presentation choice a resolver may change.
 *
 * The generic form's declared length is checked against what actually decoded. A
 * truncated answer must fail here rather than reach the parser as a short key.
 */
export function decodeOpenpgpkeyRdata(data: string): Uint8Array | null {
  const value = data.trim()

  const generic = GENERIC_FORM.exec(value)
  if (generic !== null) {
    const hex = generic[2]!.replace(/\s+/g, '')
    if (hex.length % 2 !== 0) return null

    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16))
    return bytes.length === Number(generic[1]) ? bytes : null
  }

  try {
    const base64 = value.replace(/^\(|\)$/g, '').replace(/\s+/g, '')
    if (base64.length === 0) return null

    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

export type DaneFetchResult =
  | { status: 'ok'; key: KeyMaterial }
  /** The name carries no OPENPGPKEY record. */
  | { status: 'not-found' }
  /** A record is published, but the resolver would not vouch for the zone. */
  | { status: 'unvalidated' }
  | { status: 'fetch-error'; reason: string }

/**
 * Fetches a key over DANE, insisting the resolver reports it DNSSEC-validated.
 *
 * That insistence is particular to this route. With a keyserver or WKD the key
 * arrives over TLS from a party independent of the resolver, which supplies only
 * the record confirming it; here the resolver is the source of both halves, and
 * DNSSEC is all that stands between a hijacked zone and a verified card. The
 * flag is still the resolver's own claim rather than something checked here —
 * worthless against a hostile resolver, and real against a spoofed zone upstream
 * of an honest one.
 *
 * A missing record is reported before an unsigned zone, because an operator who
 * published nothing is better told that than told to sign their zone.
 */
export async function fetchDaneKey(
  domain: string,
  hash: string,
  options: DohOptions = {},
): Promise<DaneFetchResult> {
  const answer = await queryDoh(daneName(domain, hash), OPENPGPKEY, options)
  if (answer.status === 'lookup-error') return { status: 'fetch-error', reason: answer.reason }

  const records = answer.answers
    .filter((record) => record.type === OPENPGPKEY && typeof record.data === 'string')
    .map((record) => record.data as string)

  if (records.length === 0) return { status: 'not-found' }
  if (!answer.ad) return { status: 'unvalidated' }

  for (const record of records) {
    const key = decodeOpenpgpkeyRdata(record)
    if (key !== null) return { status: 'ok', key }
  }

  return { status: 'fetch-error', reason: 'the record is not decodable rdata' }
}
