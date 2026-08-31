// The 2020 entry point carries the draft 2020-12 meta-schema; the default export is draft-07.
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

/** A key on keys.openpgp.org, named by fingerprint or long key id. */
export interface HkpSource {
  type: 'hkp'
  fingerprint: string
}

/**
 * A key in a domain's Web Key Directory. The address itself is never stored:
 * `hash` is the z-base-32 SHA-1 of the local part, which is all a WKD URL needs,
 * and `domain` has to stay in the clear because the URL is built from it.
 */
export interface WkdSource {
  type: 'wkd'
  domain: string
  hash: string
}

/**
 * A key published in DNS as an OPENPGPKEY record. Same bargain as WKD, with RFC
 * 7929's hash: SHA-256 of the local part truncated to 28 octets.
 */
export interface DaneSource {
  type: 'dane'
  domain: string
  hash: string
}

export type KeySource = HkpSource | WkdSource | DaneSource

/**
 * The order sources are tried in, most self-hosted first.
 *
 * Fixed here rather than taken from the order an entry happens to list them in,
 * so no entry can end up preferring the keyserver by accident. DANE leads
 * because it needs nothing of the operator's web server; the keyserver comes
 * last because it is the one copy the operator does not serve.
 */
export const SOURCE_ORDER = ['dane', 'wkd', 'hkp'] as const

/**
 * An entry: a deployment, the operator's consent to list it, and every place
 * their key can be fetched from.
 *
 * Several sources are a fallback chain, not alternatives — they must all be the
 * same key, which `verify:entries` checks by fetching every one of them.
 */
export interface KeyEntry {
  instance: string
  signature: string
  sources: KeySource[]
}

export interface KeysFile {
  keys: KeyEntry[]
}

/** An entry's sources in the order they should be tried. */
export function orderedSources(entry: KeyEntry): KeySource[] {
  return [...entry.sources].sort(
    (a, b) => SOURCE_ORDER.indexOf(a.type) - SOURCE_ORDER.indexOf(b.type),
  )
}

export function isHkpSource(source: KeySource): source is HkpSource {
  return source.type === 'hkp'
}

/** Describes a source for an error message, without repeating an address. */
export function sourceIdentity(source: KeySource): string {
  return isHkpSource(source)
    ? `hkp:${source.fingerprint.toLowerCase()}`
    : `${source.type}:${source.domain.toLowerCase()}/${source.hash.toLowerCase()}`
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * The cross-entry and cross-source checks the schema cannot express.
 *
 * Two entries sharing any source resolve to the same operator key, and an entry
 * listing two sources of one type would be declaring two ways to fetch what is
 * supposed to be one key from one place. Instance URLs are compared with their
 * trailing slash normalised away; hashes and fingerprints case-insensitively,
 * since their casing carries no meaning.
 */
export function findDuplicates(keys: KeyEntry[]): string[] {
  const errors: string[] = []
  const sources = new Map<string, number>()
  const instances = new Map<string, number>()

  keys.forEach((entry, index) => {
    const types = new Set<string>()
    for (const source of entry.sources) {
      if (types.has(source.type)) {
        errors.push(`keys/${index}: more than one ${source.type} source`)
      }
      types.add(source.type)

      const identity = sourceIdentity(source)
      const previous = sources.get(identity)
      if (previous !== undefined) {
        errors.push(`keys/${index}: source ${identity} already listed by entry ${previous}`)
      } else {
        sources.set(identity, index)
      }
    }

    const instance = entry.instance.replace(/\/+$/, '').toLowerCase()
    const claimed = instances.get(instance)
    if (claimed !== undefined) {
      errors.push(`keys/${index}: instance ${entry.instance} already claimed by entry ${claimed}`)
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
