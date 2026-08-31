import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HASH_LENGTH, daneName, decodeOpenpgpkeyRdata, fetchDaneKey } from './dane'
import { OPENPGPKEY } from './doh'

const KEY = new Uint8Array(
  readFileSync(resolve(__dirname, '../../tests/fixtures/keys/proof.gpg')),
)

/**
 * The two rdata framings, captured from live answers for the same real record
 * and applied here to a throwaway fixture key. What is asserted is the shape the
 * resolvers actually emit; the bytes inside are the repository's own.
 */
const rdata = (resolver: string) =>
  readFileSync(resolve(__dirname, '../../tests/fixtures/dane', `${resolver}.rdata`), 'utf8').trim()

const DOMAIN = 'example.org'
const HASH = 'c93f1e400f26708f98cb19d936620da35eec8f72e57f9eec01c1afd6'

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

const answering = (ad: boolean, ...records: string[]) =>
  new Response(
    JSON.stringify({
      Status: 0,
      AD: ad,
      Answer: records.map((data) => ({ type: OPENPGPKEY, TTL: 300, data })),
    }),
    { status: 200 },
  )

describe('daneName', () => {
  // RFC 7929's own published example, for hugh@example.com.
  it('builds the name the rfc prescribes', () => {
    expect(daneName(DOMAIN, HASH)).toBe(`${HASH}._openpgpkey.example.org`)
  })

  it('lower-cases both halves, which carry no casing of their own', () => {
    expect(daneName('Example.ORG', HASH.toUpperCase())).toBe(daneName(DOMAIN, HASH))
  })

  it('agrees with the hash length the entry schema allows', () => {
    expect(HASH.length).toBe(HASH_LENGTH)
  })
})

describe('decodeOpenpgpkeyRdata', () => {
  it('reads the generic form dns.google returns', () => {
    expect(decodeOpenpgpkeyRdata(rdata('google'))).toEqual(KEY)
  })

  it('reads the presentation form cloudflare-dns.com returns', () => {
    expect(decodeOpenpgpkeyRdata(rdata('cloudflare'))).toEqual(KEY)
  })

  // The whole point of carrying two decoders: the fallback resolver is only
  // reached when the first is down, so the forms must agree on the bytes.
  it('reads both forms to the same key', () => {
    expect(decodeOpenpgpkeyRdata(rdata('google'))).toEqual(decodeOpenpgpkeyRdata(rdata('cloudflare')))
  })

  it('tolerates wrapping, which is a resolver’s presentation choice', () => {
    const wrapped = rdata('cloudflare').replace(/(.{40})/g, '$1\n')
    expect(decodeOpenpgpkeyRdata(wrapped)).toEqual(KEY)
  })

  it('accepts base64 without the surrounding parentheses', () => {
    const bare = rdata('cloudflare').replace(/^\(\s*|\s*\)$/g, '')
    expect(decodeOpenpgpkeyRdata(bare)).toEqual(KEY)
  })

  // A truncated answer has to fail here rather than reach the parser as a key
  // that is merely shorter than it should be.
  it('rejects generic rdata whose declared length does not match', () => {
    const truncated = rdata('google').slice(0, -40)
    expect(decodeOpenpgpkeyRdata(truncated)).toBeNull()
  })

  it('rejects an odd number of hex digits', () => {
    expect(decodeOpenpgpkeyRdata('\\# 2 abc')).toBeNull()
  })

  it('rejects rdata that is neither form', () => {
    expect(decodeOpenpgpkeyRdata('not rdata at all!')).toBeNull()
    expect(decodeOpenpgpkeyRdata('')).toBeNull()
  })
})

describe('fetchDaneKey', () => {
  it('returns the key a signed zone publishes', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering(true, rdata('google')))
    const result = await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', key: KEY })
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(`type=${OPENPGPKEY}`)
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(encodeURIComponent(daneName(DOMAIN, HASH)))
  })

  it('reports not-found when the name carries no record', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering(true))
    expect(await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })).toEqual({ status: 'not-found' })
  })

  /**
   * The requirement particular to this route: here the resolver is the source of
   * both the key and the record confirming it, so an unsigned zone leaves
   * nothing standing between a hijacked domain and a verified card.
   */
  it('refuses a record the resolver will not vouch for', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering(false, rdata('google')))
    expect(await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })).toEqual({
      status: 'unvalidated',
    })
  })

  it('reports a missing record before an unsigned zone', async () => {
    // An operator who published nothing is better told that than told to sign.
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering(false))
    expect(await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })).toEqual({ status: 'not-found' })
  })

  it('reports a fetch error when no resolver answers', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => {
      throw new TypeError('Failed to fetch')
    })
    expect(await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })).toEqual({
      status: 'fetch-error',
      reason: 'Failed to fetch',
    })
  })

  it('reports a fetch error for rdata it cannot decode', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering(true, 'not rdata!'))
    expect(await fetchDaneKey(DOMAIN, HASH, { fetch: fetchImpl })).toMatchObject({
      status: 'fetch-error',
    })
  })
})
