import { daneHash } from './daneHash'

describe('daneHash', () => {
  /**
   * RFC 7929's own published example: hugh@example.com hashes to this name, so
   * the directory cannot drift into looking somewhere no other DANE client
   * would. The same role draft-koch's worked example plays for the WKD hash.
   */
  it('matches the worked example in rfc 7929', () => {
    expect(daneHash('hugh@example.com')).toEqual({
      domain: 'example.com',
      hash: 'c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6',
    })
  })

  it('truncates the digest to 28 octets, not the whole sha-256', () => {
    expect(daneHash('hugh@example.com').hash).toHaveLength(56)
  })

  it('lower-cases the local part before hashing, and the domain after', () => {
    expect(daneHash('Hugh@Example.COM')).toEqual(daneHash('hugh@example.com'))
  })

  it('splits on the last @, which a quoted local part may also contain', () => {
    expect(daneHash('a@b@example.com').domain).toBe('example.com')
  })

  it('rejects something that is not an address', () => {
    expect(() => daneHash('hugh')).toThrow(/not an address/)
    expect(() => daneHash('@example.com')).toThrow(/not an address/)
    expect(() => daneHash('hugh@')).toThrow(/not an address/)
  })
})
