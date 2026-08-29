import { HASH_LENGTH, ZBASE32_ALPHABET } from './wkd'
import { wkdHash, zbase32 } from './wkdHash'

describe('zbase32', () => {
  it('encodes nothing as nothing', () => {
    expect(zbase32(new Uint8Array([]))).toBe('')
  })

  it('encodes five bits per character, most significant first', () => {
    // 0b00000000 -> the alphabet's first character, twice (8 bits -> 2 groups).
    expect(zbase32(new Uint8Array([0]))).toBe('yy')
  })

  it('pads a trailing partial group with zero bits rather than a padding character', () => {
    // 0xff is 11111 then 111, zero-padded to 11100: indexes 31 and 28.
    expect(zbase32(new Uint8Array([0xff]))).toBe('9h')
    expect(zbase32(new Uint8Array([0xff]))).not.toContain('=')
  })

  it('encodes a 20-byte digest as exactly HASH_LENGTH characters', () => {
    expect(zbase32(new Uint8Array(20).fill(0xab))).toHaveLength(HASH_LENGTH)
  })

  it('only ever emits characters from the alphabet', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    for (const character of zbase32(bytes)) expect(ZBASE32_ALPHABET).toContain(character)
  })
})

describe('wkdHash', () => {
  /**
   * The worked example from draft-koch-openpgp-webkey-service: Joe.Doe@example.org
   * hashes to iy9q119eutrkn8s1mk4r39qejnbu3n5q. If this fails, the directory is
   * looking in a different place than every other WKD client.
   */
  it('matches the published test vector from the WKD draft', () => {
    expect(wkdHash('Joe.Doe@example.org')).toEqual({
      domain: 'example.org',
      hash: 'iy9q119eutrkn8s1mk4r39qejnbu3n5q',
    })
  })

  it('lower-cases the local part before hashing, as the spec requires', () => {
    expect(wkdHash('JOE.DOE@example.org').hash).toBe(wkdHash('joe.doe@example.org').hash)
  })

  it('lower-cases the domain, which is case-insensitive', () => {
    expect(wkdHash('joe.doe@Example.ORG').domain).toBe('example.org')
  })

  it('produces a hash the schema will accept', () => {
    const { hash } = wkdHash('someone@example.net')
    expect(hash).toHaveLength(HASH_LENGTH)
    expect(hash).toMatch(/^[ybndrfg8ejkmcpqxot1uwisza345h769]+$/)
  })

  it('distinguishes different local parts under one domain', () => {
    expect(wkdHash('alice@example.net').hash).not.toBe(wkdHash('bob@example.net').hash)
  })

  it('splits on the last @, so an address containing one still parses', () => {
    expect(wkdHash('odd@name@example.net')).toEqual({
      domain: 'example.net',
      hash: wkdHash('odd@name@example.net').hash,
    })
  })

  it('rejects input that is not an address', () => {
    expect(() => wkdHash('no-at-sign')).toThrow(/not an address/)
    expect(() => wkdHash('@example.net')).toThrow(/not an address/)
    expect(() => wkdHash('alice@')).toThrow(/not an address/)
  })
})
