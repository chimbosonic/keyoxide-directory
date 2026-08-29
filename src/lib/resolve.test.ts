import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { normalizeInstanceUrl, resolveAll, resolveEntry, sameInstance } from './resolve'
import type { KeyEntry } from './validateKeys'

const fixture = (name: string) =>
  readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys', `${name}.asc`), 'utf8')

const CLAIMED_FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'
const PLAIN_FPR = 'E9B57E7488818FE8A72CB8A20A6899A0D2FBBD4E'

const entry = (instance: string): KeyEntry => ({ fingerprint: '3AA5C34371567BD2', instance })

const serving = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }))

describe('normalizeInstanceUrl', () => {
  it('strips a trailing slash', () => {
    expect(normalizeInstanceUrl('https://kx.example.org/')).toBe('https://kx.example.org')
  })

  it('lower-cases the host', () => {
    expect(normalizeInstanceUrl('https://KX.Example.ORG')).toBe('https://kx.example.org')
  })

  it('preserves path casing, which is significant', () => {
    expect(normalizeInstanceUrl('https://kx.example.org/Profile')).toBe(
      'https://kx.example.org/Profile',
    )
  })

  it('falls back to trimming when the URL will not parse', () => {
    expect(normalizeInstanceUrl('not a url/')).toBe('not a url')
  })
})

describe('sameInstance', () => {
  it('ignores a trailing slash and host casing', () => {
    expect(sameInstance('https://KX.example.org/', 'https://kx.example.org')).toBe(true)
  })

  it('distinguishes different hosts', () => {
    expect(sameInstance('https://one.example.org', 'https://two.example.org')).toBe(false)
  })

  it('distinguishes paths differing only in case', () => {
    expect(sameInstance('https://kx.example.org/a', 'https://kx.example.org/A')).toBe(false)
  })
})

describe('resolveEntry', () => {
  it('verifies a key whose notation matches the declared deployment', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving(fixture('claimed')),
    })

    expect(result.status).toBe('verified')
    expect(result.fingerprint).toBe(CLAIMED_FPR)
    expect(result.claimedInstance).toBe('https://kx.example.org')
    expect(result.reason).toBeUndefined()
  })

  it('verifies despite a trailing slash difference', async () => {
    const result = await resolveEntry(entry('https://kx.example.org/'), {
      fetch: serving(fixture('claimed')),
    })
    expect(result.status).toBe('verified')
  })

  it('reports a mismatch when the key claims a different deployment', async () => {
    const result = await resolveEntry(entry('https://other.example.org'), {
      fetch: serving(fixture('claimed')),
    })

    expect(result.status).toBe('mismatch')
    expect(result.claimedInstance).toBe('https://kx.example.org')
    expect(result.declaredInstance).toBe('https://other.example.org')
  })

  it('reports no-notation when the key claims nothing', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving(fixture('plain')),
    })

    expect(result.status).toBe('no-notation')
    expect(result.fingerprint).toBe(PLAIN_FPR)
    expect(result.claimedInstance).toBeNull()
  })

  it('reports not-found on a 404', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving('', 404),
    })

    expect(result.status).toBe('not-found')
    expect(result.fingerprint).toBeNull()
  })

  it('reports fetch-error when the request is rejected', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })

    expect(result.status).toBe('fetch-error')
    expect(result.reason).toBe('Failed to fetch')
  })

  it('reports unreadable when the body is not a key', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving('this is not a key'),
    })

    expect(result.status).toBe('unreadable')
  })

  it('carries the declared instance through every failure state', async () => {
    const declared = 'https://kx.example.org'
    const results = await Promise.all([
      resolveEntry(entry(declared), { fetch: serving('', 404) }),
      resolveEntry(entry(declared), { fetch: serving('nonsense') }),
      resolveEntry(entry(declared), { fetch: serving('', 500) }),
    ])

    for (const result of results) expect(result.declaredInstance).toBe(declared)
  })
})

describe('resolveAll', () => {
  it('resolves each entry independently so one failure does not hide the others', async () => {
    const bodies = new Map([
      ['https://kx.example.org', fixture('claimed')],
      ['https://plain.example.org', fixture('plain')],
    ])

    let call = 0
    const order = ['https://kx.example.org', 'https://plain.example.org', 'missing']
    const fetchImpl = vi.fn(async () => {
      const key = order[call++]
      const body = bodies.get(key ?? '')
      return body ? new Response(body) : new Response('', { status: 404 })
    })

    const results = await resolveAll(
      [
        entry('https://kx.example.org'),
        entry('https://plain.example.org'),
        entry('https://gone.example.org'),
      ],
      { fetch: fetchImpl },
    )

    expect(results.map((r) => r.status)).toEqual(['verified', 'no-notation', 'not-found'])
  })

  it('returns an empty list for no entries', async () => {
    expect(await resolveAll([])).toEqual([])
  })
})
