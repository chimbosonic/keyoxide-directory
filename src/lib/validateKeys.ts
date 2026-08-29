// The 2020 entry point carries the draft 2020-12 meta-schema; the default export is draft-07.
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

/** An entry identified by the operator's key, or by an address to look it up by. */
export type KeyEntry =
  | { fingerprint: string; instance: string }
  | { email: string; instance: string }

export interface KeysFile {
  keys: KeyEntry[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function isFingerprintEntry(
  entry: KeyEntry,
): entry is { fingerprint: string; instance: string } {
  return 'fingerprint' in entry
}

/**
 * The schema cannot express "these two entries resolve to the same operator", so
 * duplicate detection lives here. Fingerprints are compared case-insensitively
 * because hex casing carries no meaning; instance URLs are compared with their
 * trailing slash normalised away.
 */
export function findDuplicates(keys: KeyEntry[]): string[] {
  const errors: string[] = []
  const seen = new Map<string, number>()

  keys.forEach((entry, index) => {
    const identity = isFingerprintEntry(entry)
      ? `fingerprint:${entry.fingerprint.toLowerCase()}`
      : `email:${entry.email.toLowerCase()}`
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
