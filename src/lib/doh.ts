/**
 * The directory's only way of reading DNS.
 *
 * A page with no backend cannot ask a resolver anything except over HTTPS, and
 * only from a resolver that allows it: both below answer with
 * `access-control-allow-origin: *`. That single constraint is why the ownership
 * records and the DANE key route share this transport rather than each rolling
 * their own.
 *
 * The trust is not cryptographic. We believe what the resolver tells us, and the
 * DNSSEC `AD` flag it returns is its own claim about having validated rather
 * than something checked here. It is still worth carrying: for a record that
 * only confirms a key it is context, and for a record that *is* the key it is
 * the difference between a signed zone and anybody's answer.
 */

/** Tried in order. The second is a fallback for the first being unreachable. */
export const RESOLVERS = [
  'https://dns.google/resolve',
  'https://cloudflare-dns.com/dns-query',
]

/** TXT, carrying an ownership record. */
export const TXT = 16

/**
 * OPENPGPKEY, carrying a key itself.
 *
 * Queried by number rather than by name: dns.google rejects `type=OPENPGPKEY`
 * with a 400, while both resolvers accept `type=61`.
 */
export const OPENPGPKEY = 61

export interface DohAnswer {
  type?: number
  data?: string
}

export type DohResult =
  /** The resolver answered. `answers` is empty when the name carries no such record. */
  | { status: 'ok'; answers: DohAnswer[]; ad: boolean }
  | { status: 'lookup-error'; reason: string }

export interface DohOptions {
  // Explicitly `| undefined`: callers forward an optional fetch straight through,
  // which exactOptionalPropertyTypes otherwise rejects.
  fetch?: typeof globalThis.fetch | undefined
  resolvers?: readonly string[] | undefined
}

export function dohUrls(
  name: string,
  type: number,
  resolvers: readonly string[] = RESOLVERS,
): string[] {
  const query = `name=${encodeURIComponent(name)}&type=${type}`
  return resolvers.map((resolver) => `${resolver}?${query}`)
}

/**
 * Asks the resolvers about one name, and returns the first real answer.
 *
 * A resolver answering "there is no such record" is an answer, and ends the
 * lookup: falling through to the second resolver would only ask the same
 * question again. Only an unreachable resolver is retried. This is the same
 * distinction `fetchWkdKey` draws between not-found and fetch-error, and it
 * matters as much here — a name that carries nothing and a resolver we could not
 * reach mean very different things on the card.
 */
export async function queryDoh(
  name: string,
  type: number,
  options: DohOptions = {},
): Promise<DohResult> {
  const doFetch = options.fetch ?? globalThis.fetch
  const resolvers = options.resolvers ?? RESOLVERS
  let lastError = 'no resolver answered'

  for (const url of dohUrls(name, type, resolvers)) {
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

    let body: { Answer?: DohAnswer[]; AD?: boolean }
    try {
      body = (await response.json()) as { Answer?: DohAnswer[]; AD?: boolean }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      continue
    }

    // No Answer section at all is how both resolvers report "nothing published",
    // whether the name is absent or merely carries no record of this type.
    return { status: 'ok', answers: body.Answer ?? [], ad: body.AD === true }
  }

  return { status: 'lookup-error', reason: lastError }
}
