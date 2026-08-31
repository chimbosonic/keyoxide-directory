import {
  FINGERPRINT_URI,
  claimedFingerprints,
  fetchOwnershipRecords,
  parseTxtData,
} from './ownership'

const FPR = 'AC48BC1F029B6188D97E2D807C855DB4466DF0C6'
const OTHER = '3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11'
/** A proof names its own domain, so the lookup asks about the domain itself. */
const NAME = 'keyoxide.dp42.dev'

/** fetch is overloaded and takes more than a string, so mocks must match its signature. */
type FetchInput = Parameters<typeof globalThis.fetch>[0]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** An answer carrying TXT records, shaped as both resolvers return them. */
const answering = (...records: string[]) =>
  json({
    Status: 0,
    Answer: records.map((data) => ({ name: `${NAME}.`, type: 16, TTL: 300, data })),
  })

/**
 * The real reply for a name with no TXT record, captured from dns.google: NOERROR
 * with no Answer section at all, only the zone's SOA in Authority.
 */
const NODATA = {
  Status: 0,
  Question: [{ name: `${NAME}.`, type: 16 }],
  Authority: [{ name: 'dp42.dev.', type: 6, TTL: 1800, data: 'peaches.ns.cloudflare.com. ...' }],
}

describe('parseTxtData', () => {
  it('unwraps the quotes a resolver puts around a record', () => {
    expect(parseTxtData(`"${FINGERPRINT_URI}${FPR}"`)).toBe(`${FINGERPRINT_URI}${FPR}`)
  })

  it('joins the chunks a value longer than 255 bytes is split into', () => {
    expect(parseTxtData('"openpgp4" "fpr:ABC"')).toBe('openpgp4fpr:ABC')
  })

  it('unescapes an escaped quote', () => {
    expect(parseTxtData('"a\\"b"')).toBe('a"b')
  })

  it('passes through a value that arrives unquoted', () => {
    expect(parseTxtData('openpgp4fpr:ABC')).toBe('openpgp4fpr:ABC')
  })
})

describe('claimedFingerprints', () => {
  it('reads the fingerprint out of a record', () => {
    expect(claimedFingerprints([`${FINGERPRINT_URI}${FPR}`])).toEqual([FPR])
  })

  it('upper-cases the hex, whose casing carries no meaning', () => {
    expect(claimedFingerprints([`${FINGERPRINT_URI}${FPR.toLowerCase()}`])).toEqual([FPR])
  })

  it('accepts an upper-case scheme', () => {
    expect(claimedFingerprints([`OPENPGP4FPR:${FPR}`])).toEqual([FPR])
  })

  it('reads every record, so key rotation needs no flag day', () => {
    expect(
      claimedFingerprints([`${FINGERPRINT_URI}${FPR}`, `${FINGERPRINT_URI}${OTHER}`]),
    ).toEqual([FPR, OTHER])
  })

  it('ignores a record that is not a fingerprint uri', () => {
    // A stray TXT under this name means the deployment has said nothing — not
    // that it has named somebody else.
    expect(claimedFingerprints(['v=spf1 -all', 'hello'])).toEqual([])
  })

  it('ignores a fingerprint uri carrying something that is not a fingerprint', () => {
    expect(claimedFingerprints([`${FINGERPRINT_URI}nonsense`])).toEqual([])
    expect(claimedFingerprints([`${FINGERPRINT_URI}${FPR.slice(0, 16)}`])).toEqual([])
  })

  // doipjs matches a claim the record *contains*, so a record Keyoxide already
  // accepts has to verify here too.
  it('finds the uri anywhere in the record, as doipjs does', () => {
    expect(claimedFingerprints([`keyoxide proof ${FINGERPRINT_URI}${FPR}`])).toEqual([FPR])
    expect(claimedFingerprints([`${FINGERPRINT_URI}${FPR} (operator key)`])).toEqual([FPR])
  })

  it('reads several claims out of one record', () => {
    expect(
      claimedFingerprints([`${FINGERPRINT_URI}${FPR} ${FINGERPRINT_URI}${OTHER}`]),
    ).toEqual([FPR, OTHER])
  })

  it('will not truncate a longer hex run into a fingerprint', () => {
    expect(claimedFingerprints([`${FINGERPRINT_URI}${FPR}AB`])).toEqual([])
  })
})

describe('fetchOwnershipRecords', () => {
  it('returns the records a deployment publishes', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) =>
      answering(`"${FINGERPRINT_URI}${FPR}"`),
    )
    const result = await fetchOwnershipRecords(NAME, { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', records: [`${FINGERPRINT_URI}${FPR}`] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('dns.google')
  })

  it('reports no records for a name that publishes none, without asking again', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) => json(NODATA))
    const result = await fetchOwnershipRecords(NAME, { fetch: fetchImpl })

    // "Nothing published" is an answer. Asking the second resolver would only
    // put the same question to a different server.
    expect(result).toEqual({ status: 'ok', records: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('ignores non-TXT answers, which a cname chain puts in the same section', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput) =>
      json({
        Status: 0,
        Answer: [
          { name: NAME, type: 5, data: 'elsewhere.example.org.' },
          { name: NAME, type: 16, data: `"${FINGERPRINT_URI}${FPR}"` },
        ],
      }),
    )
    const result = await fetchOwnershipRecords('kx.example.org', { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', records: [`${FINGERPRINT_URI}${FPR}`] })
  })

  it('passes a lookup error through rather than reporting no records', async () => {
    // The distinction the card rests on: a domain that publishes nothing and a
    // resolver that could not be reached mean very different things.
    const fetchImpl = vi.fn(async (_input: FetchInput) => new Response('<html>', { status: 200 }))
    const result = await fetchOwnershipRecords('kx.example.org', { fetch: fetchImpl })

    expect(result).toMatchObject({ status: 'lookup-error' })
  })
})
