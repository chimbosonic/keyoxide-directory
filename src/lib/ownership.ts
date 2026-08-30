/**
 * The second half of a proof.
 *
 * A `proof@ariadne.id` notation is the operator saying "I control this domain".
 * On its own that is one party talking to itself: anyone can sign a notation
 * naming somebody else's domain. This module is the domain answering back — a
 * TXT record, in the zone being claimed, naming the key allowed to claim it.
 *
 * Publishing that record requires control of the domain's DNS, which is what
 * makes the pair meaningful:
 *
 *   key  ──  proof@ariadne.id notation  ──▶  domain
 *   key  ◀──  openpgp4fpr TXT record    ──   domain
 *
 * Both halves are Keyoxide's, not this directory's: an operator who has proven a
 * domain to Keyoxide has already published everything read here. What the
 * directory adds is only the step from a domain to a deployment served under it.
 *
 * That step is by *host*, never by path: an instance at
 * `https://example.org/keyoxide` is confirmed by a record on `example.org`, and
 * a proof cannot say anything narrower than the host it names.
 *
 * The record is read over DNS-over-HTTPS because that is the only way a page
 * with no backend can read DNS at all. Both resolvers below answer with
 * `access-control-allow-origin: *`. The trust here is not cryptographic: we
 * believe what the resolver tells us, and the DNSSEC `AD` flag in its reply is
 * its own claim rather than something we verify.
 */

/** Keyoxide's own fingerprint URI syntax, reused rather than invented. */
export const FINGERPRINT_URI = 'openpgp4fpr:'

/** Tried in order. The second is a fallback for the first being unreachable. */
export const RESOLVERS = [
  'https://dns.google/resolve',
  'https://cloudflare-dns.com/dns-query',
]

export function dohUrls(name: string, resolvers: readonly string[] = RESOLVERS): string[] {
  const query = `name=${encodeURIComponent(name)}&type=TXT`
  return resolvers.map((resolver) => `${resolver}?${query}`)
}

/**
 * Unwraps a TXT record as DoH reports it: quoted, and split into several quoted
 * chunks when the value runs past the 255 bytes a single string can hold.
 */
export function parseTxtData(data: string): string {
  const chunks = data.match(/"(?:[^"\\]|\\.)*"/g)
  if (chunks === null) return data.trim()
  return chunks.map((chunk) => chunk.slice(1, -1).replace(/\\(.)/g, '$1')).join('')
}

/**
 * The fingerprints a set of records names, uppercased.
 *
 * The URI is looked for anywhere in the record rather than only at its start,
 * because that is what doipjs does: it matches a claim the record *contains*. A
 * record Keyoxide accepts has to verify here too, or reusing an operator's
 * existing proof would not actually reuse it.
 *
 * Records that name no fingerprint are ignored rather than counted as a
 * competing claim — a stray TXT under this name means the domain has said
 * nothing, not that it has named someone else. That covers the `NAME@DOMAIN`
 * record form Keyoxide also allows, which carries an address this directory
 * neither has nor wants.
 */
export function claimedFingerprints(records: readonly string[]): string[] {
  // Constructed per call: a shared /g regex carries lastIndex between callers.
  // The trailing guard stops a longer hex run being truncated into a match.
  const pattern = new RegExp(`${FINGERPRINT_URI}([0-9a-f]{40})(?![0-9a-f])`, 'gi')

  return records.flatMap((record) =>
    [...record.matchAll(pattern)].map(([, fingerprint]) => (fingerprint as string).toUpperCase()),
  )
}

export type OwnershipResult =
  /** The lookup succeeded. `records` is empty when the domain publishes none. */
  | { status: 'ok'; records: string[] }
  | { status: 'lookup-error'; reason: string }

export interface OwnershipOptions {
  fetch?: typeof globalThis.fetch | undefined
  resolvers?: readonly string[] | undefined
}

interface DohAnswer {
  type?: number
  data?: string
}

/**
 * Reads the TXT records published at a DNS name.
 *
 * A resolver answering "there is no such record" is an answer, and ends the
 * lookup: falling through to the second resolver would only ask the same
 * question again. Only an unreachable resolver is retried. This is the same
 * distinction `fetchWkdKey` draws between not-found and fetch-error, and it
 * matters as much here — a domain that publishes nothing and a resolver we
 * could not reach mean very different things on the card.
 */
export async function fetchOwnershipRecords(
  name: string,
  options: OwnershipOptions = {},
): Promise<OwnershipResult> {
  const doFetch = options.fetch ?? globalThis.fetch
  const resolvers = options.resolvers ?? RESOLVERS
  let lastError = 'no resolver answered'

  for (const url of dohUrls(name, resolvers)) {
    let response: Response
    try {
      response = await doFetch(url, { headers: { Accept: 'application/dns-json' } })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      continue
    }

    if (!response.ok) {
      lastError = `resolver responded ${response.status}`
      continue
    }

    let body: { Answer?: DohAnswer[] }
    try {
      body = (await response.json()) as { Answer?: DohAnswer[] }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      continue
    }

    // No Answer section at all is how both resolvers report "nothing published",
    // whether the name is absent or merely carries no TXT.
    const answers = body.Answer ?? []
    return {
      status: 'ok',
      records: answers
        .filter((answer) => answer.type === 16 && typeof answer.data === 'string')
        .map((answer) => parseTxtData(answer.data as string)),
    }
  }

  return { status: 'lookup-error', reason: lastError }
}
