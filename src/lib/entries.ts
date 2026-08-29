import keysFile from '../data/keys.json'
import type { KeyEntry } from './validateKeys'

/**
 * Entries are compiled in from keys.json, which CI validates against the schema
 * before it can reach main.
 *
 * The window override exists so the integration suite can drive the real
 * production bundle through every rendering state without needing keys that
 * actually exist on a keyserver. It is inert unless something sets it, and
 * confers nothing a visitor could not already do from the console.
 */
export const ENTRIES_OVERRIDE = '__KEYOXIDE_DIRECTORY_ENTRIES__'

export function loadEntries(source: unknown = globalThis): KeyEntry[] {
  const override = (source as Record<string, unknown>)[ENTRIES_OVERRIDE]
  if (Array.isArray(override)) return override as KeyEntry[]

  return keysFile.keys as KeyEntry[]
}
