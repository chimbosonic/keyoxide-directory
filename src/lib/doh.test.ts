import { OPENPGPKEY, RESOLVERS, TXT, dohUrls, queryDoh } from './doh'

const NAME = 'keyoxide.dp42.dev'

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const answering = (...records: string[]) =>
  json({
    Status: 0,
    AD: true,
    Answer: records.map((data) => ({ name: `${NAME}.`, type: TXT, TTL: 300, data })),
  })

/**
 * The real reply for a name with no record of the type asked for, captured from
 * dns.google: NOERROR with no Answer section at all, only the zone's SOA.
 */
const NODATA = {
  Status: 0,
  Question: [{ name: `${NAME}.`, type: TXT }],
  Authority: [{ name: 'dp42.dev.', type: 6, TTL: 1800, data: 'peaches.ns.cloudflare.com. ...' }],
}

describe('dohUrls', () => {
  it('queries every resolver for the same name and type', () => {
    const urls = dohUrls(NAME, TXT)

    expect(urls).toHaveLength(RESOLVERS.length)
    for (const url of urls) expect(url).toContain(`name=${encodeURIComponent(NAME)}&type=16`)
    expect(urls[0]).toContain('dns.google')
  })

  // dns.google answers `type=OPENPGPKEY` with a 400; both resolvers take the number.
  it('asks for a record type by number, never by name', () => {
    expect(dohUrls(NAME, OPENPGPKEY)[0]).toContain('type=61')
    expect(dohUrls(NAME, OPENPGPKEY)[0]).not.toContain('OPENPGPKEY')
  })

  it('percent-encodes the name', () => {
    expect(dohUrls('_keyoxide.example.org', TXT)[0]).toContain(
      encodeURIComponent('_keyoxide.example.org'),
    )
  })
})

describe('queryDoh', () => {
  it('returns the answers the first resolver gives', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => answering('"hello"'))
    const result = await queryDoh(NAME, TXT, { fetch: fetchImpl })

    expect(result).toMatchObject({ status: 'ok', ad: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('dns.google')
  })

  it('reports an empty answer for a name carrying nothing, without asking again', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => json(NODATA))
    const result = await queryDoh(NAME, TXT, { fetch: fetchImpl })

    // "Nothing published" is an answer. Asking the second resolver would only
    // put the same question to a different server.
    expect(result).toEqual({ status: 'ok', answers: [], ad: false })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports the AD flag as false when the resolver omits it', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => json({ Status: 0, Answer: [] }))
    const result = await queryDoh(NAME, TXT, { fetch: fetchImpl })

    expect(result).toMatchObject({ ad: false })
  })

  it('falls back to the second resolver when the first cannot be reached', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) => {
      if (String(input).includes('dns.google')) throw new TypeError('Failed to fetch')
      return answering('"hello"')
    })
    const result = await queryDoh(NAME, TXT, { fetch: fetchImpl })

    expect(result).toMatchObject({ status: 'ok' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('falls back when the first resolver errors', async () => {
    const fetchImpl = vi.fn(async (input: FetchInput) =>
      String(input).includes('dns.google') ? json({}, 502) : answering('"hello"'),
    )

    expect(await queryDoh(NAME, TXT, { fetch: fetchImpl })).toMatchObject({ status: 'ok' })
  })

  it('reports a lookup error when no resolver can be reached', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => {
      throw new TypeError('Failed to fetch')
    })
    const result = await queryDoh(NAME, TXT, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'lookup-error', reason: 'Failed to fetch' })
    expect(fetchImpl).toHaveBeenCalledTimes(RESOLVERS.length)
  })

  it('reports a lookup error when a resolver returns something that is not json', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => new Response('<html>', { status: 200 }))

    expect(await queryDoh(NAME, TXT, { fetch: fetchImpl })).toMatchObject({
      status: 'lookup-error',
    })
  })
})
