import schema from '../data/keys.schema.json'
import keysFile from '../data/keys.json'
import { findDuplicates, validateKeysFile, type KeyEntry } from './validateKeys'

const FPR = '3AA5C34371567BD2'
const FULL_FPR = '3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11'
const INSTANCE = 'https://kx.example.org'

/** Every character of the z-base-32 alphabet, which is exactly a hash's length. */
const HASH = 'ybndrfg8ejkmcpqxot1uwisza345h769'

const hkp = (over: Record<string, unknown> = {}) => ({
  type: 'hkp',
  fingerprint: FPR,
  instance: INSTANCE,
  ...over,
})

const wkd = (over: Record<string, unknown> = {}) => ({
  type: 'wkd',
  domain: 'example.net',
  hash: HASH,
  instance: INSTANCE,
  ...over,
})

const file = (...keys: unknown[]) => ({ keys })

describe('validateKeysFile', () => {
  it('accepts an hkp entry', () => {
    expect(validateKeysFile(schema, file(hkp()))).toEqual({ valid: true, errors: [] })
  })

  it('accepts a full 40-character fingerprint', () => {
    expect(validateKeysFile(schema, file(hkp({ fingerprint: FULL_FPR }))).valid).toBe(true)
  })

  it('accepts a wkd entry', () => {
    expect(validateKeysFile(schema, file(wkd()))).toEqual({ valid: true, errors: [] })
  })

  it('accepts an empty list', () => {
    expect(validateKeysFile(schema, file()).valid).toBe(true)
  })

  it('rejects an entry with no type', () => {
    const { type: _type, ...untyped } = hkp()
    expect(validateKeysFile(schema, file(untyped)).valid).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(validateKeysFile(schema, file(hkp({ type: 'wkd2' }))).valid).toBe(false)
  })

  it('rejects an hkp entry carrying wkd fields', () => {
    expect(
      validateKeysFile(schema, file(hkp({ domain: 'example.net', hash: HASH }))).valid,
    ).toBe(false)
  })

  it('rejects a wkd entry carrying a fingerprint', () => {
    expect(validateKeysFile(schema, file(wkd({ fingerprint: FPR }))).valid).toBe(false)
  })

  it('rejects a wkd entry declaring itself hkp', () => {
    expect(validateKeysFile(schema, file(wkd({ type: 'hkp' }))).valid).toBe(false)
  })

  it('rejects a short key id', () => {
    expect(validateKeysFile(schema, file(hkp({ fingerprint: '71567BD2' }))).valid).toBe(false)
  })

  it('rejects a non-hex fingerprint', () => {
    expect(validateKeysFile(schema, file(hkp({ fingerprint: 'ZZZZC34371567BD2' }))).valid).toBe(
      false,
    )
  })

  it('rejects a hash of the wrong length', () => {
    expect(validateKeysFile(schema, file(wkd({ hash: HASH.slice(0, 31) }))).valid).toBe(false)
    expect(validateKeysFile(schema, file(wkd({ hash: `${HASH}y` }))).valid).toBe(false)
  })

  it('rejects a hash using characters outside the z-base-32 alphabet', () => {
    // l, v, 0 and 2 are the characters z-base-32 leaves out as easily confused.
    for (const excluded of ['l', 'v', '0', '2']) {
      const hash = `${excluded}${HASH.slice(1)}`
      expect(validateKeysFile(schema, file(wkd({ hash }))).valid).toBe(false)
    }
  })

  it('rejects a hash written in upper case', () => {
    expect(validateKeysFile(schema, file(wkd({ hash: HASH.toUpperCase() }))).valid).toBe(false)
  })

  it('rejects an address in place of a domain', () => {
    expect(validateKeysFile(schema, file(wkd({ domain: 'alice@example.net' }))).valid).toBe(false)
  })

  it('rejects a plain http instance URL', () => {
    expect(validateKeysFile(schema, file(hkp({ instance: 'http://kx.example.org' }))).valid).toBe(
      false,
    )
  })

  it('rejects a missing instance', () => {
    const { instance: _instance, ...noInstance } = hkp()
    expect(validateKeysFile(schema, file(noInstance)).valid).toBe(false)
  })

  it('rejects unknown properties', () => {
    expect(validateKeysFile(schema, file(hkp({ note: 'hi' }))).valid).toBe(false)
  })

  it('rejects two identical entries', () => {
    expect(validateKeysFile(schema, file(hkp(), hkp())).valid).toBe(false)
  })

  it('reports duplicate errors from the cross-entry checks', () => {
    const result = validateKeysFile(
      schema,
      file(
        hkp({ instance: 'https://one.example.org' }),
        hkp({ fingerprint: FPR.toLowerCase(), instance: 'https://two.example.org' }),
      ),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain('duplicate')
  })

  it('validates the checked-in keys.json', () => {
    expect(validateKeysFile(schema, keysFile)).toEqual({ valid: true, errors: [] })
  })
})

describe('findDuplicates', () => {
  const entries = (...keys: KeyEntry[]) => keys

  const hkpEntry = (fingerprint: string, instance: string): KeyEntry => ({
    type: 'hkp',
    fingerprint,
    instance,
  })

  const wkdEntry = (domain: string, hash: string, instance: string): KeyEntry => ({
    type: 'wkd',
    domain,
    hash,
    instance,
  })

  it('finds nothing in a clean list', () => {
    expect(
      findDuplicates(
        entries(
          hkpEntry(FPR, 'https://one.example.org'),
          wkdEntry('example.net', HASH, 'https://two.example.org'),
        ),
      ),
    ).toEqual([])
  })

  it('treats fingerprint casing as insignificant', () => {
    const found = findDuplicates(
      entries(
        hkpEntry(FPR, 'https://one.example.org'),
        hkpEntry(FPR.toLowerCase(), 'https://two.example.org'),
      ),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('keys/1')
  })

  it('treats domain casing as insignificant', () => {
    expect(
      findDuplicates(
        entries(
          wkdEntry('Example.NET', HASH, 'https://one.example.org'),
          wkdEntry('example.net', HASH, 'https://two.example.org'),
        ),
      ),
    ).toHaveLength(1)
  })

  it('treats the same hash under a different domain as a different operator', () => {
    expect(
      findDuplicates(
        entries(
          wkdEntry('one.example.org', HASH, 'https://one.example.org'),
          wkdEntry('two.example.org', HASH, 'https://two.example.org'),
        ),
      ),
    ).toEqual([])
  })

  it('flags one instance claimed by two different keys', () => {
    const found = findDuplicates(
      entries(
        hkpEntry(FPR, 'https://kx.example.org'),
        wkdEntry('example.net', HASH, 'https://kx.example.org/'),
      ),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('already claimed')
  })
})
