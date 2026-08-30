import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { normalizeInstanceUrl, resolveAll, resolveEntry, sameInstance } from './resolve'
import type { KeyEntry } from './validateKeys'

const fixture = (name: string) =>
  readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys', `${name}.asc`), 'utf8')

const CLAIMED_FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'
const PLAIN_FPR = 'E9B57E7488818FE8A72CB8A20A6899A0D2FBBD4E'

const entry = (instance: string): KeyEntry => ({
  type: 'hkp',
  fingerprint: '3AA5C34371567BD2',
  instance,
})

const HASH = 'ybndrfg8ejkmcpqxot1uwisza345h769'

const wkdEntry = (instance: string): KeyEntry => ({
  type: 'wkd',
  domain: 'example.net',
  hash: HASH,
  instance,
})

/** The same key WKD would serve: the armored fixture with its armor stripped. */
const binaryFixture = (name: string) =>
  new Uint8Array(readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys', `${name}.gpg`)))

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

const DOH = /dns\.google|cloudflare-dns\.com/

const ownershipAnswer = (...fingerprints: string[]) =>
  new Response(
    JSON.stringify({
      Status: 0,
      Answer: fingerprints.map((fingerprint) => ({
        type: 16,
        data: `"openpgp4fpr:${fingerprint}"`,
      })),
    }),
    { status: 200 },
  )

/**
 * Routes a request the way the two halves of a claim are really fetched: the key
 * from a keyserver or a WKD host, the ownership record from a DoH resolver. The
 * default owner is the fixture's own key, so an entry that claims correctly
 * verifies.
 */
const serve = (
  key: () => Response,
  owner: () => Response = () => ownershipAnswer(CLAIMED_FPR),
) => vi.fn(async (input: FetchInput) => (DOH.test(String(input)) ? owner() : key()))

const serving = (body: string, status = 200) => serve(() => new Response(body, { status }))

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

  it('does not verify a key the deployment says nothing about', async () => {
    // The impersonation case: the notation matches the entry perfectly, because
    // both halves were written by whoever holds the key. Only the deployment can
    // settle it, and here it has not.
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('claimed')),
        () => new Response(JSON.stringify({ Status: 0 }), { status: 200 }),
      ),
    })

    expect(result.status).toBe('unconfirmed')
    expect(result.fingerprint).toBe(CLAIMED_FPR)
    expect(result.claimedInstance).toBe('https://kx.example.org')
  })

  it('flags a deployment that names a different key', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('claimed')),
        () => ownershipAnswer(PLAIN_FPR),
      ),
    })

    expect(result.status).toBe('contested')
  })

  it('verifies when the deployment names this key among several', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('claimed')),
        () => ownershipAnswer(PLAIN_FPR, CLAIMED_FPR),
      ),
    })

    expect(result.status).toBe('verified')
  })

  it('accepts a record whose hex is lower case', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('claimed')),
        () => ownershipAnswer(CLAIMED_FPR.toLowerCase()),
      ),
    })

    expect(result.status).toBe('verified')
  })

  it('treats an unreachable resolver as unknown, not as a failed claim', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: vi.fn(async (input: FetchInput) => {
        if (DOH.test(String(input))) throw new TypeError('Failed to fetch')
        return new Response(fixture('claimed'))
      }),
    })

    expect(result.status).toBe('dns-error')
  })

  it('does not ask about ownership for a claim that already failed', async () => {
    // A key claiming somewhere else is settled without a resolver being troubled.
    const fetchImpl = serve(() => new Response(fixture('claimed')))
    await resolveEntry(entry('https://other.example.org'), { fetch: fetchImpl })

    const requested = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(requested.some((url) => DOH.test(url))).toBe(false)
  })

  it('resolves a wkd entry from its domain, not the keyserver', async () => {
    const fetchImpl = serve(() => new Response(binaryFixture('claimed'), { status: 200 }))
    const result = await resolveEntry(wkdEntry('https://kx.example.org'), { fetch: fetchImpl })

    expect(result.status).toBe('verified')
    expect(result.fingerprint).toBe(CLAIMED_FPR)

    const requested = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(requested[0]).toBe(
      `https://openpgpkey.example.net/.well-known/openpgpkey/example.net/hu/${HASH}`,
    )
    for (const url of requested) expect(url).not.toContain('keys.openpgp.org')
  })

  it('falls back from the advanced wkd url to the direct one', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      const url = String(input)
      if (DOH.test(url)) return ownershipAnswer(CLAIMED_FPR)
      return url.startsWith('https://openpgpkey.')
        ? new Response('', { status: 404 })
        : new Response(binaryFixture('claimed'), { status: 200 })
    })
    const result = await resolveEntry(wkdEntry('https://kx.example.org'), { fetch: fetchImpl })

    expect(result.status).toBe('verified')
    // Both WKD urls, then the resolver.
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('reports a wkd entry with no key published as not-found, naming the domain', async () => {
    const result = await resolveEntry(wkdEntry('https://kx.example.org'), {
      fetch: serving('', 404),
    })

    expect(result.status).toBe('not-found')
    expect(result.reason).toBe('no key published at example.net')
  })

  it('does not fall back to the keyserver when wkd fails', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => {
      throw new TypeError('Failed to fetch')
    })
    const result = await resolveEntry(wkdEntry('https://kx.example.org'), { fetch: fetchImpl })

    expect(result.status).toBe('fetch-error')
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      `https://openpgpkey.example.net/.well-known/openpgpkey/example.net/hu/${HASH}`,
      `https://example.net/.well-known/openpgpkey/hu/${HASH}`,
    ])
  })

  it('classifies a wkd key claiming a different deployment as a mismatch', async () => {
    const result = await resolveEntry(wkdEntry('https://other.example.org'), {
      fetch: serve(() => new Response(binaryFixture('claimed'), { status: 200 })),
    })

    expect(result.status).toBe('mismatch')
    expect(result.claimedInstance).toBe('https://kx.example.org')
  })

  it('looks the ownership record up under the declared instance host', async () => {
    const fetchImpl = serve(() => new Response(fixture('claimed')))
    await resolveEntry(entry('https://kx.example.org'), { fetch: fetchImpl })

    const resolverCall = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .find((url) => DOH.test(url))

    expect(resolverCall).toContain(encodeURIComponent('_keyoxide-directory.kx.example.org'))
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
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      if (DOH.test(String(input))) return ownershipAnswer(CLAIMED_FPR)
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
