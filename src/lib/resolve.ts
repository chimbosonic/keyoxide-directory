import { fetchKey, type FetchOptions } from './keyserver'
import { parseKey, type KeyMaterial } from './parseKey'
import { isHkpEntry, type KeyEntry } from './validateKeys'
import { fetchWkdKey } from './wkd'

export type ResolvedStatus =
  /** The key carries the notation and it matches what the entry declares. */
  | 'verified'
  /** The key carries a notation, but for a different deployment. */
  | 'mismatch'
  /** The key was fetched, but claims no deployment. */
  | 'no-notation'
  /** The source has no such key: the keyserver does not hold it, or the domain publishes none. */
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
  /** The deployment the key itself claims, when it claims one. */
  claimedInstance: string | null
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
 * Compares deployment URLs the way an operator would mean them: scheme and host
 * are case-insensitive, a trailing slash is meaningless, but the path is left
 * alone because paths genuinely are case-sensitive.
 */
export function normalizeInstanceUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
  } catch {
    return url.replace(/\/+$/, '')
  }
}

export function sameInstance(a: string, b: string): boolean {
  return normalizeInstanceUrl(a) === normalizeInstanceUrl(b)
}

type MaterialResult =
  | { status: 'ok'; key: KeyMaterial }
  | { status: 'not-found'; reason: string }
  | { status: 'fetch-error'; reason: string }

/**
 * Routes an entry to its transport. The two are disjoint by construction: a
 * fingerprint is what VKS can look up, a domain and hash is what WKD can, and
 * neither source can serve the other's entries, so there is nothing to fall
 * back to when one fails.
 */
async function fetchMaterial(entry: KeyEntry, options: FetchOptions): Promise<MaterialResult> {
  if (isHkpEntry(entry)) {
    const fetched = await fetchKey(entry, options)
    return fetched.status === 'ok'
      ? { status: 'ok', key: fetched.armored }
      : fetched.status === 'not-found'
        ? { status: 'not-found', reason: 'no such key on the keyserver' }
        : { status: 'fetch-error', reason: fetched.reason }
  }

  const fetched = await fetchWkdKey(entry.domain, entry.hash, { fetch: options.fetch })
  return fetched.status === 'ok'
    ? { status: 'ok', key: fetched.key }
    : fetched.status === 'not-found'
      ? { status: 'not-found', reason: `no key published at ${entry.domain}` }
      : { status: 'fetch-error', reason: fetched.reason }
}

/** Fetches, parses, and classifies a single directory entry. */
export async function resolveEntry(
  entry: KeyEntry,
  options: FetchOptions = {},
): Promise<ResolvedInstance> {
  const base: Omit<ResolvedInstance, 'status'> = {
    entry,
    declaredInstance: entry.instance,
    claimedInstance: null,
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

  const { fingerprint, instanceUrl } = parsed.key
  if (instanceUrl === null) {
    return {
      ...base,
      fingerprint,
      status: 'no-notation',
      reason: 'key claims no deployment',
    }
  }

  if (!sameInstance(instanceUrl, entry.instance)) {
    return {
      ...base,
      fingerprint,
      claimedInstance: instanceUrl,
      status: 'mismatch',
      reason: 'key claims a different deployment',
    }
  }

  return { ...base, fingerprint, claimedInstance: instanceUrl, status: 'verified' }
}

/** Resolves every entry concurrently; one failure never blocks the rest. */
export async function resolveAll(
  entries: readonly KeyEntry[],
  options: FetchOptions = {},
): Promise<ResolvedInstance[]> {
  return Promise.all(entries.map((entry) => resolveEntry(entry, options)))
}
