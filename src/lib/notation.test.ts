import { parseDnsClaim } from './notation'

describe('parseDnsClaim', () => {
  it('reads the domain out of a dns claim', () => {
    expect(parseDnsClaim('dns:example.org?type=TXT')).toBe('example.org')
  })

  it('accepts a claim without the query, as doipjs does', () => {
    expect(parseDnsClaim('dns:example.org')).toBe('example.org')
  })

  it('lowercases the domain and drops the root label', () => {
    expect(parseDnsClaim('dns:KX.Example.ORG.?type=TXT')).toBe('kx.example.org')
  })

  it('ignores surrounding whitespace', () => {
    expect(parseDnsClaim('  dns:example.org?type=TXT  ')).toBe('example.org')
  })

  it('ignores proofs that are not dns claims', () => {
    expect(parseDnsClaim('https://mastodon.example.org/@someone')).toBeNull()
    expect(parseDnsClaim('xmpp:someone@example.org?omemo-sid-1=...')).toBeNull()
    expect(parseDnsClaim('aspe:example.org:ABCDEF')).toBeNull()
  })

  // Anchored, unlike doipjs's own regex: reading a domain out of the prefix of a
  // claim that does not parse whole would confirm a domain nobody wrote.
  it('rejects a claim with trailing junk rather than reading its prefix', () => {
    expect(parseDnsClaim('dns:example.org/../evil.example.com')).toBeNull()
  })

  it('rejects a single label, which nobody publishes records under', () => {
    expect(parseDnsClaim('dns:localhost')).toBeNull()
    expect(parseDnsClaim('dns:')).toBeNull()
  })
})
