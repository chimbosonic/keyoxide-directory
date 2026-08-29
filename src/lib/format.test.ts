import { instanceHost, shortKeyId } from './format'

describe('shortKeyId', () => {
  it('renders the last 16 characters of a full fingerprint, grouped', () => {
    expect(shortKeyId('A78357EB843206292AD791A33D150A4804FDAB79')).toBe('0x3D15 0A48 04FD AB79')
  })

  it('renders a 16-character long key id unchanged apart from grouping', () => {
    expect(shortKeyId('3AA5C34371567BD2')).toBe('0x3AA5 C343 7156 7BD2')
  })

  it('upper-cases hex so casing in keys.json does not leak into the page', () => {
    expect(shortKeyId('3aa5c34371567bd2')).toBe('0x3AA5 C343 7156 7BD2')
  })

  it('ignores whitespace in the input', () => {
    expect(shortKeyId('3AA5 C343 7156 7BD2')).toBe('0x3AA5 C343 7156 7BD2')
  })

  it('returns null when there is no fingerprint', () => {
    expect(shortKeyId(null)).toBeNull()
  })

  it('returns null for input too short to be a long key id', () => {
    expect(shortKeyId('DEADBEEF')).toBeNull()
  })
})

describe('instanceHost', () => {
  it('extracts the host', () => {
    expect(instanceHost('https://kx.example.org/some/path')).toBe('kx.example.org')
  })

  it('keeps a port, which distinguishes deployments', () => {
    expect(instanceHost('https://kx.example.org:8443')).toBe('kx.example.org:8443')
  })

  it('falls back to the raw string when it will not parse', () => {
    expect(instanceHost('not a url')).toBe('not a url')
  })
})
