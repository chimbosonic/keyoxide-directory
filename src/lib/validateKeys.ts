// The 2020 entry point carries the draft 2020-12 meta-schema; the default export is draft-07.
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

/** A key on keys.openpgp.org, named by fingerprint or long key id. */
export interface HkpEntry {
  type: 'hkp'
  fingerprint: string
  instance: string
}

/**
 * A key in a domain's Web Key Directory. The address itself is never stored:
 * `hash` is the z-base-32 SHA-1 of the local part, which is all a WKD URL needs,
 * and `domain` has to stay in the clear because the URL is built from it.
 */
export interface WkdEntry {
  type: 'wkd'
  domain: string
  hash: string
  instance: string
}

/**
 * Every entry names the lookup it wants rather than leaving it to be inferred
 * from which fields happen to be present, so the two routes cannot be confused
 * and the compiler can check that both are handled.
 */
export type KeyEntry = HkpEntry | WkdEntry

export interface KeysFile {
  keys: KeyEntry[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function isHkpEntry(entry: KeyEntry): entry is HkpEntry {
  return entry.type === 'hkp'
}

export function isWkdEntry(entry: KeyEntry): entry is WkdEntry {
  return entry.type === 'wkd'
}

/**
 * The schema cannot express "these two entries resolve to the same operator", so
 * duplicate detection lives here. Fingerprints and domains are compared
 * case-insensitively because their casing carries no meaning; instance URLs are
 * compared with their trailing slash normalised away.
 *
 * A WKD entry's identity is its domain and hash together: the same hash under
 * two domains is two different addresses.
 */
export function findDuplicates(keys: KeyEntry[]): string[] {
  const errors: string[] = []
  const seen = new Map<string, number>()

  keys.forEach((entry, index) => {
    const identity = isHkpEntry(entry)
      ? `fingerprint:${entry.fingerprint.toLowerCase()}`
      : `wkd:${entry.domain.toLowerCase()}/${entry.hash}`
    const previous = seen.get(identity)
    if (previous !== undefined) {
      errors.push(`keys/${index}: duplicate of entry ${previous} (${identity})`)
    } else {
      seen.set(identity, index)
    }
  })

  const instances = new Map<string, number>()
  keys.forEach((entry, index) => {
    const instance = entry.instance.replace(/\/+$/, '').toLowerCase()
    const previous = instances.get(instance)
    if (previous !== undefined) {
      errors.push(`keys/${index}: instance ${entry.instance} already claimed by entry ${previous}`)
    } else {
      instances.set(instance, index)
    }
  })

  return errors
}

/**
 * Validates a keys file against the schema, then applies the cross-entry checks
 * the schema cannot express. Schema and data are passed in rather than imported
 * so the same function serves the unit tests, and the CLI that reads them off disk.
 */
export function validateKeysFile(schema: object, data: unknown): ValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: true })
  addFormats(ajv)

  const validate = ajv.compile(schema)
  if (!validate(data)) {
    const errors = (validate.errors ?? []).map(
      (error) => `${error.instancePath || '/'}: ${error.message ?? 'invalid'}`,
    )
    return { valid: false, errors }
  }

  const errors = findDuplicates((data as KeysFile).keys)
  return { valid: errors.length === 0, errors }
}
