import { fetchKey, type FetchOptions } from './keyserver'
import { parseKey } from './parseKey'
import type { KeyEntry } from './validateKeys'

export type ResolvedStatus =
  /** The key carries the notation and it matches what the entry declares. */
  | 'verified'
  /** The key carries a notation, but for a different deployment. */
  | 'mismatch'
  /** The key was fetched, but claims no deployment. */
  | 'no-notation'
  /** The keyserver has no such key. */
  | 'not-found'
  /** The key was fetched but could not be parsed. */
  | 'unreadable'
  /** The lookup itself failed: network, CORS, or a keyserver error. */
  | 'fetch-error'

export interface ResolvedInstance {
  entry: KeyEntry
  /** The deployment the directory entry declares. */
  declaredInstance: string
  /** The deployment the key itself claims, when it claims one. */
  claimedInstance: string | null
  fingerprint: string | null
  status: ResolvedStatus
  /** Human-readable detail, present only for the failure states. */
  reason?: string
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

  const fetched = await fetchKey(entry, options)
  if (fetched.status === 'not-found') {
    return { ...base, status: 'not-found', reason: 'no such key on the keyserver' }
  }
  if (fetched.status === 'fetch-error') {
    return { ...base, status: 'fetch-error', reason: fetched.reason }
  }

  const parsed = await parseKey(fetched.armored)
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
