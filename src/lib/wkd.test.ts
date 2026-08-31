import {
  HASH_LENGTH,
  ZBASE32_ALPHABET,
  advancedUrl,
  directUrl,
  fetchWkdKey,
  wkdUrls,
} from './wkd'

const DOMAIN = 'example.net'
const HASH = '4hg7tescnttreiwsdimeeorxg1eplrtb'

const ADVANCED = `https://openpgpkey.${DOMAIN}/.well-known/openpgpkey/${DOMAIN}/hu/${HASH}`
const DIRECT = `https://${DOMAIN}/.well-known/openpgpkey/hu/${HASH}`

const KEY_BYTES = new Uint8Array([0x98, 0x33, 0x04, 0x6a])

const binaryResponse = (bytes: Uint8Array<ArrayBuffer>) => new Response(bytes, { status: 200 })

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

/** Answers each URL from a map; anything unlisted 404s, as a real host would. */
const serve = (routes: Record<string, () => Response | Promise<Response>>) =>
  vi.fn(async (input: FetchInput) =>
    (routes[String(input)] ?? (() => new Response('', { status: 404 })))(),
  )

describe('z-base-32 constants', () => {
  it('has 32 distinct characters', () => {
    expect(ZBASE32_ALPHABET).toHaveLength(32)
    expect(new Set(ZBASE32_ALPHABET).size).toBe(32)
  })

  it('encodes a 160-bit digest in exactly HASH_LENGTH characters', () => {
    expect(HASH_LENGTH).toBe(Math.ceil(160 / 5))
  })
})

describe('wkd urls', () => {
  it('builds the advanced url with the domain as both subdomain and path segment', () => {
    expect(advancedUrl(DOMAIN, HASH)).toBe(ADVANCED)
  })

  it('builds the direct url from the domain itself', () => {
    expect(directUrl(DOMAIN, HASH)).toBe(DIRECT)
  })

  it('lower-cases the domain, which is case-insensitive, in both forms', () => {
    expect(advancedUrl('Example.NET', HASH)).toBe(ADVANCED)
    expect(directUrl('Example.NET', HASH)).toBe(DIRECT)
  })

  it('tries the advanced url before the direct one', () => {
    expect(wkdUrls(DOMAIN, HASH)).toEqual([ADVANCED, DIRECT])
  })

  it('never includes the l= parameter, which would carry a plaintext local part', () => {
    for (const url of wkdUrls(DOMAIN, HASH)) expect(url).not.toContain('?l=')
  })
})

describe('fetchWkdKey', () => {
  it('returns the key bytes from the advanced url without trying the direct one', async () => {
    const fetchImpl = serve({ [ADVANCED]: () => binaryResponse(KEY_BYTES) })
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', key: KEY_BYTES, url: ADVANCED })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('falls back to the direct url when the advanced host 404s', async () => {
    const fetchImpl = serve({ [DIRECT]: () => binaryResponse(KEY_BYTES) })
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', key: KEY_BYTES, url: DIRECT })
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([ADVANCED, DIRECT])
  })

  it('falls back when the advanced host does not resolve at all', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      if (String(input) === ADVANCED) throw new TypeError('Failed to fetch')
      return binaryResponse(KEY_BYTES)
    })
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toMatchObject({ status: 'ok', url: DIRECT })
  })

  it('reports not-found when both urls 404', async () => {
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: serve({}) })
    expect(result).toEqual({ status: 'not-found' })
  })

  it('reports a fetch error, not not-found, when both urls fail to answer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'fetch-error', reason: 'Failed to fetch' })
  })

  it('keeps the error when one url fails and the other merely 404s', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      if (String(input) === ADVANCED) return new Response('', { status: 404 })
      throw new TypeError('CORS blocked')
    })
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'fetch-error', reason: 'CORS blocked' })
  })

  it('treats a non-404 error response as a failure carrying the status', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }))
    const result = await fetchWkdKey(DOMAIN, HASH, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'fetch-error', reason: `${DIRECT} responded 500` })
  })
})
