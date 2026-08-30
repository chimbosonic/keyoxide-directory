import schema from '../data/keys.schema.json'
import keysFile from '../data/keys.json'
import {
  findDuplicates,
  orderedSources,
  validateKeysFile,
  type KeyEntry,
  type KeySource,
} from './validateKeys'

const FPR = '3AA5C34371567BD2'
const FULL_FPR = '3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11'
const INSTANCE = 'https://kx.example.org'

/** Every character of the z-base-32 alphabet, which is exactly a hash's length. */
const WKD_HASH = 'ybndrfg8ejkmcpqxot1uwisza345h769'
/** RFC 7929's own example hash, for hugh@example.com. */
const DANE_HASH = 'c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6'

/** Shaped like a real one; whether it verifies is verify:entries' question, not the schema's. */
const SIGNATURE = 'iHUEABYKAB0WIQQSUgHK82DZDVJUn2KgozL1Nh6zHwUCaLL/AAoJEA=='

const hkp = (over: Record<string, unknown> = {}) => ({ type: 'hkp', fingerprint: FPR, ...over })
const wkd = (over: Record<string, unknown> = {}) => ({
  type: 'wkd',
  domain: 'example.net',
  hash: WKD_HASH,
  ...over,
})
const dane = (over: Record<string, unknown> = {}) => ({
  type: 'dane',
  domain: 'example.net',
  hash: DANE_HASH,
  ...over,
})

const entry = (sources: unknown[], over: Record<string, unknown> = {}) => ({
  instance: INSTANCE,
  signature: SIGNATURE,
  sources,
  ...over,
})

const file = (...keys: unknown[]) => ({ keys })

describe('validateKeysFile', () => {
  it('accepts each kind of source', () => {
    for (const source of [hkp(), wkd(), dane()]) {
      expect(validateKeysFile(schema, file(entry([source])))).toEqual({ valid: true, errors: [] })
    }
  })

  it('accepts all three declared together as a fallback chain', () => {
    expect(validateKeysFile(schema, file(entry([dane(), wkd(), hkp()])))).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('accepts a full 40-character fingerprint', () => {
    expect(validateKeysFile(schema, file(entry([hkp({ fingerprint: FULL_FPR })]))).valid).toBe(true)
  })

  it('rejects an entry with no sources at all', () => {
    expect(validateKeysFile(schema, file(entry([]))).valid).toBe(false)
  })

  it('rejects an entry carrying no signature', () => {
    const { signature: _dropped, ...unsigned } = entry([hkp()])
    const result = validateKeysFile(schema, file(unsigned))

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('signature')
  })

  it('rejects a signature that is not base64', () => {
    const result = validateKeysFile(schema, file(entry([hkp()], { signature: 'not base64!' })))

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('pattern')
  })

  it('accepts an empty list', () => {
    expect(validateKeysFile(schema, file()).valid).toBe(true)
  })

  it('rejects a source with no type', () => {
    const { type: _dropped, ...untyped } = wkd()
    expect(validateKeysFile(schema, file(entry([untyped]))).valid).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(validateKeysFile(schema, file(entry([wkd({ type: 'keybase' })]))).valid).toBe(false)
  })

  it('rejects a source mixing the fields of two types', () => {
    expect(validateKeysFile(schema, file(entry([hkp({ domain: 'example.net' })]))).valid).toBe(false)
    expect(validateKeysFile(schema, file(entry([wkd({ fingerprint: FPR })]))).valid).toBe(false)
  })

  it('rejects a wkd source declaring itself hkp', () => {
    expect(validateKeysFile(schema, file(entry([wkd({ type: 'hkp' })]))).valid).toBe(false)
  })

  it('rejects a short key id', () => {
    expect(validateKeysFile(schema, file(entry([hkp({ fingerprint: '3AA5C343' })]))).valid).toBe(
      false,
    )
  })

  it('rejects a non-hex fingerprint', () => {
    expect(
      validateKeysFile(schema, file(entry([hkp({ fingerprint: 'ZZZ5C34371567BD2' })]))).valid,
    ).toBe(false)
  })

  // The two hashes are different lengths in different alphabets, so a source
  // carrying the wrong one for its type must not slip through.
  it('rejects each hash under the other type', () => {
    expect(validateKeysFile(schema, file(entry([wkd({ hash: DANE_HASH })]))).valid).toBe(false)
    expect(validateKeysFile(schema, file(entry([dane({ hash: WKD_HASH })]))).valid).toBe(false)
  })

  it('rejects a wkd hash using characters outside the z-base-32 alphabet', () => {
    // l, v, 0 and 2 are the four the alphabet drops as easily confused.
    for (const character of ['l', 'v', '0', '2']) {
      const hash = `${character}${WKD_HASH.slice(1)}`
      expect(validateKeysFile(schema, file(entry([wkd({ hash })]))).valid).toBe(false)
    }
  })

  it('rejects a dane hash written in upper case', () => {
    expect(
      validateKeysFile(schema, file(entry([dane({ hash: DANE_HASH.toUpperCase() })]))).valid,
    ).toBe(false)
  })

  it('rejects an address in place of a domain', () => {
    expect(validateKeysFile(schema, file(entry([wkd({ domain: 'me@example.net' })]))).valid).toBe(
      false,
    )
  })

  it('rejects a plain http instance URL', () => {
    expect(
      validateKeysFile(schema, file(entry([hkp()], { instance: 'http://kx.example.org' }))).valid,
    ).toBe(false)
  })

  it('rejects a missing instance', () => {
    const { instance: _dropped, ...headless } = entry([hkp()])
    expect(validateKeysFile(schema, file(headless)).valid).toBe(false)
  })

  it('rejects unknown properties', () => {
    expect(validateKeysFile(schema, file(entry([hkp()], { note: 'hello' }))).valid).toBe(false)
    expect(validateKeysFile(schema, file(entry([hkp({ note: 'hello' })]))).valid).toBe(false)
  })

  it('rejects two identical entries', () => {
    expect(validateKeysFile(schema, file(entry([hkp()]), entry([hkp()]))).valid).toBe(false)
  })

  it('reports duplicate errors from the cross-entry checks', () => {
    const result = validateKeysFile(
      schema,
      file(entry([hkp()]), entry([hkp()], { instance: 'https://other.example.org' })),
    )

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('already listed')
  })

  it('validates the checked-in keys.json', () => {
    expect(validateKeysFile(schema, keysFile)).toEqual({ valid: true, errors: [] })
  })
})

describe('orderedSources', () => {
  const of = (...sources: KeySource[]): KeyEntry => ({
    instance: INSTANCE,
    signature: SIGNATURE,
    sources,
  })

  /**
   * The order is the directory's, not the file's, so no entry can end up
   * preferring the keyserver because of how someone typed it out.
   */
  it('tries dane, then wkd, then hkp, whatever order they are written in', () => {
    const listed = of(hkp() as KeySource, wkd() as KeySource, dane() as KeySource)
    expect(orderedSources(listed).map((source) => source.type)).toEqual(['dane', 'wkd', 'hkp'])
  })

  it('leaves a single source alone', () => {
    expect(orderedSources(of(hkp() as KeySource)).map((s) => s.type)).toEqual(['hkp'])
  })

  it('does not reorder the entry itself', () => {
    const listed = of(hkp() as KeySource, dane() as KeySource)
    orderedSources(listed)

    expect(listed.sources.map((source) => source.type)).toEqual(['hkp', 'dane'])
  })
})

describe('findDuplicates', () => {
  const withSources = (sources: KeySource[], instance = INSTANCE): KeyEntry => ({
    instance,
    signature: SIGNATURE,
    sources,
  })

  it('finds nothing in a clean list', () => {
    expect(
      findDuplicates([
        withSources([hkp() as KeySource]),
        withSources([wkd() as KeySource], 'https://other.example.org'),
      ]),
    ).toEqual([])
  })

  it('flags one entry declaring two sources of the same type', () => {
    // They are meant to be one key in several places, not several keys.
    const errors = findDuplicates([
      withSources([hkp() as KeySource, hkp({ fingerprint: FULL_FPR }) as KeySource]),
    ])

    expect(errors.join(' ')).toContain('more than one hkp source')
  })

  it('treats fingerprint casing as insignificant', () => {
    const errors = findDuplicates([
      withSources([hkp() as KeySource]),
      withSources([hkp({ fingerprint: FPR.toLowerCase() }) as KeySource], 'https://b.example.org'),
    ])

    expect(errors.join(' ')).toContain('already listed')
  })

  it('flags two entries sharing a source across different types', () => {
    const errors = findDuplicates([
      withSources([dane() as KeySource, wkd() as KeySource]),
      withSources([wkd() as KeySource], 'https://b.example.org'),
    ])

    expect(errors.join(' ')).toContain('already listed')
  })

  it('treats the same hash under a different domain as a different operator', () => {
    expect(
      findDuplicates([
        withSources([wkd() as KeySource]),
        withSources([wkd({ domain: 'other.example.org' }) as KeySource], 'https://b.example.org'),
      ]),
    ).toEqual([])
  })

  it('flags one instance claimed by two different keys', () => {
    const errors = findDuplicates([
      withSources([hkp() as KeySource]),
      withSources([hkp({ fingerprint: FULL_FPR }) as KeySource]),
    ])

    expect(errors.join(' ')).toContain('already claimed')
  })
})
