import { fetchDaneKey } from './dane.ts'
import { deploymentHost } from './format'
import { fetchKey, type FetchOptions } from './keyserver'
import { claimedFingerprints, fetchOwnershipRecords } from './ownership'
import { parseKey, type KeyMaterial } from './parseKey'
import { orderedSources, type KeyEntry, type KeySource } from './validateKeys'
import { fetchWkdKey } from './wkd'

export type ResolvedStatus =
  /** A domain the key proves covers the instance's host, and names the key back. */
  | 'verified'
  /** The proven domain publishes no record naming a key, so the proof is half-built. */
  | 'unconfirmed'
  /** The proven domain names a key, and it is not this one. */
  | 'contested'
  /** No resolver could be reached, so ownership could not be checked either way. */
  | 'dns-error'
  /** The key proves domains, and none of them covers this instance's host. */
  | 'mismatch'
  /** The key was fetched, and proves no domain over dns at all. */
  | 'no-notation'
  /** A DANE record exists, but the resolver would not vouch for its zone. */
  | 'unvalidated'
  /** No source has the key: the keyserver does not hold it, or the domain publishes none. */
  | 'not-found'
  /** The key was fetched but could not be parsed. */
  | 'unreadable'
  /** The lookup itself failed: network, CORS, or a server error. */
  | 'fetch-error'

/**
 * Every resolved entry is a card, but not every card is a resolved entry: the
 * pinned project instance has no key behind it and so no resolved status.
 */
export type CardStatus =
  | ResolvedStatus
  /** Pinned by the directory itself rather than claimed by a key. */
  | 'project'

/** What a card needs to render, which is deliberately less than an entry carries. */
export interface DirectoryCard {
  /** The deployment the card is for. */
  declaredInstance: string
  /** Every domain the key proves over dns, which need not include this one's. */
  provenDomains: string[]
  /**
   * The proven domain the deployment's host was confirmed under, once one covers
   * it. Equal to the host itself in the ordinary case, and a parent of it when
   * the operator's proof sits higher up the zone — which the card says out loud,
   * because a parent's holder is not always the host's operator.
   */
  confirmedVia: string | null
  fingerprint: string | null
  status: CardStatus
  /** Human-readable detail, present only for the failure states. */
  reason?: string
}

export interface ResolvedInstance extends DirectoryCard {
  entry: KeyEntry
  status: ResolvedStatus
}

/**
 * Whether a domain the key proves vouches for a deployment's host.
 *
 * A proof on the host itself is the exact case. A proof on a parent covers it
 * too, because publishing a record at `example.org` takes control of that zone,
 * and `kx.example.org` ordinarily lives in it. Ordinarily, not always: a
 * delegated subdomain has its own operator, and this rule lets the parent's
 * holder confirm a deployment they do not run. That is why the covering domain
 * is carried through to the card rather than collapsed into a yes.
 *
 * No public suffix list is needed to stop a proof on `co.uk` covering the world:
 * it would first have to be published at `co.uk`.
 */
export function coversHost(domain: string, host: string): boolean {
  const proven = domain.toLowerCase().replace(/\.+$/, '')
  const target = host.toLowerCase()
  return target === proven || target.endsWith(`.${proven}`)
}

/**
 * The proven domain that confirms a host, preferring the most specific: a key
 * proving both `example.org` and `kx.example.org` confirms the latter under its
 * own name, so the card has no reason to mention the parent.
 */
export function coveringDomain(domains: readonly string[], host: string | null): string | null {
  if (host === null) return null

  return (
    [...domains]
      .filter((domain) => coversHost(domain, host))
      .sort((a, b) => b.length - a.length)[0] ?? null
  )
}

type SourceFailure =
  | { status: 'not-found'; reason: string }
  | { status: 'unvalidated'; reason: string }
  | { status: 'fetch-error'; reason: string }

type SourceResult = { status: 'ok'; key: KeyMaterial } | SourceFailure

type MaterialResult = SourceResult

/** Fetches a key from one declared source. */
async function fetchFromSource(
  source: KeySource,
  options: FetchOptions,
): Promise<SourceResult> {
  if (source.type === 'hkp') {
    const fetched = await fetchKey(source, options)
    return fetched.status === 'ok'
      ? { status: 'ok', key: fetched.armored }
      : fetched.status === 'not-found'
        ? { status: 'not-found', reason: 'no such key on the keyserver' }
        : { status: 'fetch-error', reason: fetched.reason }
  }

  if (source.type === 'dane') {
    const fetched = await fetchDaneKey(source.domain, source.hash, { fetch: options.fetch })
    return fetched.status === 'ok'
      ? { status: 'ok', key: fetched.key }
      : fetched.status === 'not-found'
        ? { status: 'not-found', reason: `no openpgpkey record at ${source.domain}` }
        : fetched.status === 'unvalidated'
          ? { status: 'unvalidated', reason: `${source.domain} is not a dnssec-signed zone` }
          : { status: 'fetch-error', reason: fetched.reason }
  }

  const fetched = await fetchWkdKey(source.domain, source.hash, { fetch: options.fetch })
  return fetched.status === 'ok'
    ? { status: 'ok', key: fetched.key }
    : fetched.status === 'not-found'
      ? { status: 'not-found', reason: `no key published at ${source.domain}` }
      : { status: 'fetch-error', reason: fetched.reason }
}

/**
 * Tries an entry's sources in order and returns the first key one yields.
 *
 * They are a fallback chain: the same key in several places, so the first that
 * answers settles it and the rest are never asked. Which is why a source that
 * merely has nothing to say does not end the chain — an operator who publishes
 * over DANE and on the keyserver should not be undone by a WKD host that 404s.
 *
 * When none answers, the failure reported is the first one that was more than
 * "nothing here", in the same order. A DANE record on an unsigned zone is a
 * misconfiguration of the operator's first-choice route and worth naming, while
 * a source that simply holds no key is only worth reporting if every source
 * agreed on it.
 */
async function fetchMaterial(entry: KeyEntry, options: FetchOptions): Promise<MaterialResult> {
  const failures: SourceFailure[] = []

  for (const source of orderedSources(entry)) {
    const result = await fetchFromSource(source, options)
    if (result.status === 'ok') return result
    failures.push(result)
  }

  const notable = failures.find((failure) => failure.status !== 'not-found')
  if (notable !== undefined) return notable

  return {
    status: 'not-found',
    reason: failures.map((failure) => failure.reason).join('; ') || 'the entry lists no source',
  }
}

/** Fetches, parses, and classifies a single directory entry. */
export async function resolveEntry(
  entry: KeyEntry,
  options: FetchOptions = {},
): Promise<ResolvedInstance> {
  const base: Omit<ResolvedInstance, 'status'> = {
    entry,
    declaredInstance: entry.instance,
    provenDomains: [],
    confirmedVia: null,
    fingerprint: null,
  }

  const fetched = await fetchMaterial(entry, options)
  if (fetched.status !== 'ok') {
    return { ...base, status: fetched.status, reason: fetched.reason }
  }

  const parsed = await parseKey(fetched.key)
  if (parsed.status === 'unreadable') {
    return { ...base, status: 'unreadable', reason: parsed.reason }
  }

  const { fingerprint, provenDomains } = parsed.key
  if (provenDomains.length === 0) {
    return {
      ...base,
      fingerprint,
      status: 'no-notation',
      reason: 'key proves no domain over dns',
    }
  }

  const confirmedVia = coveringDomain(provenDomains, deploymentHost(entry.instance))
  if (confirmedVia === null) {
    return {
      ...base,
      fingerprint,
      provenDomains,
      status: 'mismatch',
      reason: 'the key proves no domain covering this deployment',
    }
  }

  // The key's half is settled; now ask the domain it names. Only reached once a
  // proof covers the host, so the statuses stay disjoint and no entry that has
  // already failed costs a DNS query.
  const claimed: Omit<ResolvedInstance, 'status'> = {
    ...base,
    fingerprint,
    provenDomains,
    confirmedVia,
  }

  const records = await fetchOwnershipRecords(confirmedVia, { fetch: options.fetch })
  if (records.status === 'lookup-error') {
    return { ...claimed, status: 'dns-error', reason: records.reason }
  }

  const owners = claimedFingerprints(records.records)
  if (owners.length === 0) {
    return {
      ...claimed,
      status: 'unconfirmed',
      reason: `${confirmedVia} publishes no record naming a key`,
    }
  }

  if (!owners.includes(fingerprint.toUpperCase())) {
    return {
      ...claimed,
      status: 'contested',
      reason: `${confirmedVia} names a different key`,
    }
  }

  return { ...claimed, status: 'verified' }
}

/** Resolves every entry concurrently; one failure never blocks the rest. */
export async function resolveAll(
  entries: readonly KeyEntry[],
  options: FetchOptions = {},
): Promise<ResolvedInstance[]> {
  return Promise.all(entries.map((entry) => resolveEntry(entry, options)))
}
