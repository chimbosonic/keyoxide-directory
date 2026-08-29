import schema from '../data/keys.schema.json'
import keysFile from '../data/keys.json'
import { findDuplicates, validateKeysFile, type KeyEntry } from './validateKeys'

const FPR = '3AA5C34371567BD2'
const FULL_FPR = '3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11'

const file = (...keys: unknown[]) => ({ keys })

describe('validateKeysFile', () => {
  it('accepts a fingerprint entry', () => {
    const result = validateKeysFile(schema, file({ fingerprint: FPR, instance: 'https://kx.example.org' }))
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts a full 40-character fingerprint', () => {
    const result = validateKeysFile(schema, file({ fingerprint: FULL_FPR, instance: 'https://kx.example.org' }))
    expect(result.valid).toBe(true)
  })

  it('accepts an email entry', () => {
    const result = validateKeysFile(schema, file({ email: 'alice@example.invalid', instance: 'https://kx.example.org' }))
    expect(result.valid).toBe(true)
  })

  it('accepts an empty list', () => {
    const result = validateKeysFile(schema, file())
    expect(result.valid).toBe(true)
  })

  it('rejects an entry with both a fingerprint and an email', () => {
    const result = validateKeysFile(
      schema,
      file({ fingerprint: FPR, email: 'alice@example.invalid', instance: 'https://kx.example.org' }),
    )
    expect(result.valid).toBe(false)
  })

  it('rejects an entry with neither a fingerprint nor an email', () => {
    expect(validateKeysFile(schema, file({ instance: 'https://kx.example.org' })).valid).toBe(false)
  })

  it('rejects a short key id', () => {
    expect(validateKeysFile(schema, file({ fingerprint: '71567BD2', instance: 'https://kx.example.org' })).valid).toBe(false)
  })

  it('rejects a non-hex fingerprint', () => {
    expect(validateKeysFile(schema, file({ fingerprint: 'ZZZZC34371567BD2', instance: 'https://kx.example.org' })).valid).toBe(false)
  })

  it('rejects a malformed email', () => {
    expect(validateKeysFile(schema, file({ email: 'not-an-address', instance: 'https://kx.example.org' })).valid).toBe(false)
  })

  it('rejects a plain http instance URL', () => {
    expect(validateKeysFile(schema, file({ fingerprint: FPR, instance: 'http://kx.example.org' })).valid).toBe(false)
  })

  it('rejects a missing instance', () => {
    expect(validateKeysFile(schema, file({ fingerprint: FPR })).valid).toBe(false)
  })

  it('rejects unknown properties', () => {
    expect(
      validateKeysFile(schema, file({ fingerprint: FPR, instance: 'https://kx.example.org', note: 'hi' })).valid,
    ).toBe(false)
  })

  it('rejects two identical entries', () => {
    const entry = { fingerprint: FPR, instance: 'https://kx.example.org' }
    expect(validateKeysFile(schema, file(entry, { ...entry })).valid).toBe(false)
  })

  it('reports duplicate errors from the cross-entry checks', () => {
    const result = validateKeysFile(
      schema,
      file(
        { fingerprint: FPR, instance: 'https://one.example.org' },
        { fingerprint: FPR.toLowerCase(), instance: 'https://two.example.org' },
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

  it('finds nothing in a clean list', () => {
    expect(
      findDuplicates(
        entries(
          { fingerprint: FPR, instance: 'https://one.example.org' },
          { email: 'alice@example.invalid', instance: 'https://two.example.org' },
        ),
      ),
    ).toEqual([])
  })

  it('treats fingerprint casing as insignificant', () => {
    const found = findDuplicates(
      entries(
        { fingerprint: FPR, instance: 'https://one.example.org' },
        { fingerprint: FPR.toLowerCase(), instance: 'https://two.example.org' },
      ),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('keys/1')
  })

  it('treats email casing as insignificant', () => {
    expect(
      findDuplicates(
        entries(
          { email: 'Alice@Example.invalid', instance: 'https://one.example.org' },
          { email: 'alice@example.invalid', instance: 'https://two.example.org' },
        ),
      ),
    ).toHaveLength(1)
  })

  it('flags one instance claimed by two different keys', () => {
    const found = findDuplicates(
      entries(
        { fingerprint: FPR, instance: 'https://kx.example.org' },
        { email: 'alice@example.invalid', instance: 'https://kx.example.org/' },
      ),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('already claimed')
  })
})
