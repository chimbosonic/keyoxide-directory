import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { OPENPGPKEY, TXT } from './doh'
import { coveringDomain, coversHost, resolveAll, resolveEntry } from './resolve'
import type { KeyEntry, KeySource } from './validateKeys'

const fixture = (name: string) =>
  readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys', `${name}.asc`), 'utf8')

/** Proves kx.example.org, and nothing else. */
const PROOF_FPR = '125201CAF360D90D52549F62A0A332F5361EB31F'
/** Proves legacy.example.org, multi.example.org and second.example.org. */
const PROOFS_FPR = '7853FDF799B81400814C279B187149C137000B9D'
/** Proves nothing: no notations at all. */
const PLAIN_FPR = 'E9B57E7488818FE8A72CB8A20A6899A0D2FBBD4E'

const HASH = 'ybndrfg8ejkmcpqxot1uwisza345h769'
const DANE_HASH = 'c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6'
const SIGNATURE = 'iHUEABYKAB0WIQQSUgHK82DZDVJUn2KgozL1Nh6zHwUCaLL/AAoJEA=='

const HKP: KeySource = { type: 'hkp', fingerprint: '3AA5C34371567BD2' }
const WKD: KeySource = { type: 'wkd', domain: 'example.net', hash: HASH }
const DANE: KeySource = { type: 'dane', domain: 'example.net', hash: DANE_HASH }

const listing = (instance: string, ...sources: KeySource[]): KeyEntry => ({
  instance,
  signature: SIGNATURE,
  sources,
})

const entry = (instance: string): KeyEntry => listing(instance, HKP)
const wkdEntry = (instance: string): KeyEntry => listing(instance, WKD)
const daneEntry = (instance: string): KeyEntry => listing(instance, DANE)

/** The same key WKD would serve: the armored fixture with its armor stripped. */
const binaryFixture = (name: string) =>
  new Uint8Array(readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys', `${name}.gpg`)))

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

const DOH = /dns\.google|cloudflare-dns\.com/
const isOwnershipQuery = (url: string) => DOH.test(url) && url.includes(`type=${TXT}`)
const isDaneQuery = (url: string) => DOH.test(url) && url.includes(`type=${OPENPGPKEY}`)

/** An OPENPGPKEY answer, in the generic form dns.google returns. */
const daneAnswer = (key: Uint8Array, ad = true) =>
  new Response(
    JSON.stringify({
      Status: 0,
      AD: ad,
      Answer: [
        {
          type: OPENPGPKEY,
          data: `\\# ${key.length} ${[...key].map((b) => b.toString(16).padStart(2, '0')).join('')}`,
        },
      ],
    }),
    { status: 200 },
  )

const emptyAnswer = (ad = true) =>
  new Response(JSON.stringify({ Status: 0, AD: ad }), { status: 200 })

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
 * Routes a request the way the two halves of a proof are really fetched: the key
 * from a keyserver or a WKD host, the record from a DoH resolver. The default
 * owner is the fixture's own key, so a key proving the right domain verifies.
 */
const serve = (key: () => Response, owner: () => Response = () => ownershipAnswer(PROOF_FPR)) =>
  vi.fn(async (input: FetchInput) => (isOwnershipQuery(String(input)) ? owner() : key()))

const serving = (body: string, status = 200) => serve(() => new Response(body, { status }))

describe('coversHost', () => {
  it('covers the host it names', () => {
    expect(coversHost('kx.example.org', 'kx.example.org')).toBe(true)
  })

  it('covers a subdomain of itself, whose zone it controls', () => {
    expect(coversHost('example.org', 'kx.example.org')).toBe(true)
    expect(coversHost('example.org', 'a.b.example.org')).toBe(true)
  })

  it('does not cover a parent of itself', () => {
    expect(coversHost('kx.example.org', 'example.org')).toBe(false)
  })

  it('does not cover a sibling', () => {
    expect(coversHost('kx.example.org', 'other.example.org')).toBe(false)
  })

  // The one a naive suffix check gets wrong: matching has to be by label.
  it('does not cover a host that merely ends with its name', () => {
    expect(coversHost('example.org', 'notexample.org')).toBe(false)
  })

  it('ignores casing and a trailing root label', () => {
    expect(coversHost('Example.ORG.', 'kx.example.org')).toBe(true)
  })
})

describe('coveringDomain', () => {
  it('returns null when nothing the key proves covers the host', () => {
    expect(coveringDomain(['other.example.org'], 'kx.example.org')).toBeNull()
  })

  it('returns null for a host that would not parse', () => {
    expect(coveringDomain(['example.org'], null)).toBeNull()
  })

  // A key proving both means the card has no reason to mention the parent.
  it('prefers the most specific proof', () => {
    expect(coveringDomain(['example.org', 'kx.example.org'], 'kx.example.org')).toBe(
      'kx.example.org',
    )
  })
})

describe('resolveEntry', () => {
  it('verifies a key that proves the deployment’s host', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving(fixture('proof')),
    })

    expect(result.status).toBe('verified')
    expect(result.fingerprint).toBe(PROOF_FPR)
    expect(result.confirmedVia).toBe('kx.example.org')
    expect(result.reason).toBeUndefined()
  })

  it('verifies despite a trailing slash or a path, which the host ignores', async () => {
    for (const instance of ['https://kx.example.org/', 'https://kx.example.org/keyoxide']) {
      const result = await resolveEntry(entry(instance), { fetch: serving(fixture('proof')) })
      expect(result.status).toBe('verified')
    }
  })

  it('verifies a deployment on a subdomain of a proven domain, and says which', async () => {
    const result = await resolveEntry(entry('https://kx.multi.example.org'), {
      fetch: serve(
        () => new Response(fixture('proofs')),
        () => ownershipAnswer(PROOFS_FPR),
      ),
    })

    expect(result.status).toBe('verified')
    expect(result.confirmedVia).toBe('multi.example.org')
  })

  it('asks the proven domain about the key, not the deployment’s own host', async () => {
    const fetchImpl = serve(
      () => new Response(fixture('proofs')),
      () => ownershipAnswer(PROOFS_FPR),
    )
    await resolveEntry(entry('https://kx.multi.example.org'), { fetch: fetchImpl })

    const resolverCall = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .find((url) => DOH.test(url))

    expect(resolverCall).toContain(encodeURIComponent('multi.example.org'))
    expect(resolverCall).not.toContain(encodeURIComponent('kx.multi.example.org'))
  })

  it('reports a mismatch when the key proves no domain covering the deployment', async () => {
    const result = await resolveEntry(entry('https://other.example.org'), {
      fetch: serving(fixture('proof')),
    })

    expect(result.status).toBe('mismatch')
    expect(result.provenDomains).toEqual(['kx.example.org'])
    expect(result.declaredInstance).toBe('https://other.example.org')
    expect(result.confirmedVia).toBeNull()
  })

  it('reports no-notation when the key proves nothing at all', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving(fixture('plain')),
    })

    expect(result.status).toBe('no-notation')
    expect(result.fingerprint).toBe(PLAIN_FPR)
    expect(result.provenDomains).toEqual([])
  })

  it('reports no-notation for a key whose notations are not proofs', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serving(fixture('claimed')),
    })

    expect(result.status).toBe('no-notation')
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

  it('does not verify a key the domain says nothing about', async () => {
    // The half-built proof: the key claims the domain, which anyone can sign.
    // Only the domain can settle it, and here it has not.
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('proof')),
        () => new Response(JSON.stringify({ Status: 0 }), { status: 200 }),
      ),
    })

    expect(result.status).toBe('unconfirmed')
    expect(result.fingerprint).toBe(PROOF_FPR)
    expect(result.confirmedVia).toBe('kx.example.org')
  })

  it('flags a domain that names a different key', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('proof')),
        () => ownershipAnswer(PLAIN_FPR),
      ),
    })

    expect(result.status).toBe('contested')
  })

  it('verifies when the domain names this key among several', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('proof')),
        () => ownershipAnswer(PLAIN_FPR, PROOF_FPR),
      ),
    })

    expect(result.status).toBe('verified')
  })

  it('accepts a record whose hex is lower case', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: serve(
        () => new Response(fixture('proof')),
        () => ownershipAnswer(PROOF_FPR.toLowerCase()),
      ),
    })

    expect(result.status).toBe('verified')
  })

  it('treats an unreachable resolver as unknown, not as a failed proof', async () => {
    const result = await resolveEntry(entry('https://kx.example.org'), {
      fetch: vi.fn(async (input: FetchInput) => {
        if (DOH.test(String(input))) throw new TypeError('Failed to fetch')
        return new Response(fixture('proof'))
      }),
    })

    expect(result.status).toBe('dns-error')
  })

  it('does not ask about ownership for a proof that already failed', async () => {
    // A key proving somewhere else is settled without a resolver being troubled.
    const fetchImpl = serve(() => new Response(fixture('proof')))
    await resolveEntry(entry('https://other.example.org'), { fetch: fetchImpl })

    const requested = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(requested.some((url) => DOH.test(url))).toBe(false)
  })

  it('resolves a wkd entry from its domain, not the keyserver', async () => {
    const fetchImpl = serve(() => new Response(binaryFixture('proof'), { status: 200 }))
    const result = await resolveEntry(wkdEntry('https://kx.example.org'), { fetch: fetchImpl })

    expect(result.status).toBe('verified')
    expect(result.fingerprint).toBe(PROOF_FPR)

    const requested = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(requested[0]).toBe(
      `https://openpgpkey.example.net/.well-known/openpgpkey/example.net/hu/${HASH}`,
    )
    for (const url of requested) expect(url).not.toContain('keys.openpgp.org')
  })

  it('falls back from the advanced wkd url to the direct one', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      const url = String(input)
      if (DOH.test(url)) return ownershipAnswer(PROOF_FPR)
      return url.startsWith('https://openpgpkey.')
        ? new Response('', { status: 404 })
        : new Response(binaryFixture('proof'), { status: 200 })
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

  it('classifies a wkd key proving somewhere else as a mismatch', async () => {
    const result = await resolveEntry(wkdEntry('https://other.example.org'), {
      fetch: serve(() => new Response(binaryFixture('proof'), { status: 200 })),
    })

    expect(result.status).toBe('mismatch')
    expect(result.provenDomains).toEqual(['kx.example.org'])
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

describe('resolveEntry, across several sources', () => {
  const KEY = new Uint8Array(
    readFileSync(resolvePath(__dirname, '../../tests/fixtures/keys/proof.gpg')),
  )

  /** Routes by record type and by host, so each source can answer separately. */
  const chain = (handlers: {
    dane?: () => Response
    wkd?: () => Response
    hkp?: () => Response
  }) =>
    vi.fn(async (input: FetchInput) => {
      const url = String(input)
      if (isOwnershipQuery(url)) return ownershipAnswer(PROOF_FPR)
      if (isDaneQuery(url)) return handlers.dane?.() ?? emptyAnswer()
      if (url.includes('keys.openpgp.org')) return handlers.hkp?.() ?? new Response('', { status: 404 })
      return handlers.wkd?.() ?? new Response('', { status: 404 })
    })

  it('verifies from the first source that answers', async () => {
    const fetchImpl = chain({ dane: () => daneAnswer(KEY) })
    const result = await resolveEntry(listing('https://kx.example.org', HKP, WKD, DANE), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('verified')

    // DANE first regardless of the order they were listed in, and once it
    // answers the others are never asked.
    const requested = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(requested.some((url) => url.includes('keys.openpgp.org'))).toBe(false)
    expect(requested.some((url) => url.includes('.well-known/openpgpkey'))).toBe(false)
  })

  it('falls through a source that has nothing published', async () => {
    const fetchImpl = chain({
      dane: () => emptyAnswer(),
      wkd: () => new Response(binaryFixture('proof')),
    })
    const result = await resolveEntry(listing('https://kx.example.org', DANE, WKD), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('verified')
  })

  /**
   * A DANE record on an unsigned zone is refused, but refusing it must not take
   * the entry down when the operator also published somewhere else.
   */
  it('falls through a dane record the resolver will not vouch for', async () => {
    const fetchImpl = chain({
      dane: () => daneAnswer(KEY, false),
      hkp: () => new Response(fixture('proof')),
    })
    const result = await resolveEntry(listing('https://kx.example.org', DANE, HKP), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('verified')
  })

  it('reports an unsigned zone when dane is the only source', async () => {
    const fetchImpl = chain({ dane: () => daneAnswer(KEY, false) })
    const result = await resolveEntry(daneEntry('https://kx.example.org'), { fetch: fetchImpl })

    expect(result.status).toBe('unvalidated')
    expect(result.reason).toContain('example.net')
  })

  it('reports not-found only when every source agrees there is nothing', async () => {
    const fetchImpl = chain({})
    const result = await resolveEntry(listing('https://kx.example.org', DANE, WKD, HKP), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('not-found')
  })

  /**
   * "Nothing published here" is weaker information than "this route is broken",
   * so the failure reported is the first that was more than an absence.
   */
  it('prefers a real failure over a source that simply had nothing', async () => {
    const fetchImpl = chain({
      dane: () => emptyAnswer(),
      wkd: () => new Response('', { status: 500 }),
    })
    const result = await resolveEntry(listing('https://kx.example.org', DANE, WKD), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('fetch-error')
  })

  it('reports nothing about a source it never had to ask', async () => {
    const fetchImpl = chain({ dane: () => daneAnswer(KEY), wkd: () => new Response('', { status: 500 }) })
    const result = await resolveEntry(listing('https://kx.example.org', DANE, WKD), {
      fetch: fetchImpl,
    })

    expect(result.status).toBe('verified')
  })
})

describe('resolveAll', () => {
  it('resolves each entry independently so one failure does not hide the others', async () => {
    const bodies = new Map([
      ['https://kx.example.org', fixture('proof')],
      ['https://plain.example.org', fixture('plain')],
    ])

    let call = 0
    const order = ['https://kx.example.org', 'https://plain.example.org', 'missing']
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      if (DOH.test(String(input))) return ownershipAnswer(PROOF_FPR)
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
