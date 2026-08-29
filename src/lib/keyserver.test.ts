import { KEYSERVER, fetchKey, keyUrl } from './keyserver'
import type { HkpEntry } from './validateKeys'

const LONG_ID = '3AA5C34371567BD2'
const FULL_FPR = '3AA5C34371567BD2C5A1F0F1D0F4C2E8B7A69C11'
const INSTANCE = 'https://kx.example.org'

const fprEntry = (fingerprint: string): HkpEntry => ({
  type: 'hkp',
  fingerprint,
  instance: INSTANCE,
})

const respond = (body: string, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body, { status: 200, ...init }))

describe('keyUrl', () => {
  it('uses by-keyid for a 16-character long key id', () => {
    expect(keyUrl(fprEntry(LONG_ID))).toBe(`${KEYSERVER}/vks/v1/by-keyid/${LONG_ID}`)
  })

  it('uses by-fingerprint for a 40-character fingerprint', () => {
    expect(keyUrl(fprEntry(FULL_FPR))).toBe(`${KEYSERVER}/vks/v1/by-fingerprint/${FULL_FPR}`)
  })

  it('upper-cases hex so the URL is stable regardless of how it was written', () => {
    expect(keyUrl(fprEntry(LONG_ID.toLowerCase()))).toBe(
      `${KEYSERVER}/vks/v1/by-keyid/${LONG_ID}`,
    )
  })

  it('accepts a base override without doubling the slash', () => {
    expect(keyUrl(fprEntry(LONG_ID), 'https://keyserver.example.org/')).toBe(
      `https://keyserver.example.org/vks/v1/by-keyid/${LONG_ID}`,
    )
  })
})

describe('fetchKey', () => {
  it('returns the armored body on success', async () => {
    const fetchImpl = respond('-----BEGIN PGP PUBLIC KEY BLOCK-----')
    const result = await fetchKey(fprEntry(LONG_ID), { fetch: fetchImpl })

    expect(result).toEqual({ status: 'ok', armored: '-----BEGIN PGP PUBLIC KEY BLOCK-----' })
    expect(fetchImpl).toHaveBeenCalledWith(
      `${KEYSERVER}/vks/v1/by-keyid/${LONG_ID}`,
      { headers: { Accept: 'application/pgp-keys' } },
    )
  })

  it('reports a 404 as not-found rather than an error', async () => {
    const result = await fetchKey(fprEntry(LONG_ID), { fetch: respond('', { status: 404 }) })
    expect(result).toEqual({ status: 'not-found' })
  })

  it('reports other non-ok responses as a fetch error carrying the status', async () => {
    const result = await fetchKey(fprEntry(LONG_ID), { fetch: respond('', { status: 500 }) })
    expect(result).toEqual({ status: 'fetch-error', reason: 'keyserver responded 500' })
  })

  it('reports a rejected request (network or CORS) as a fetch error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await fetchKey(fprEntry(LONG_ID), { fetch: fetchImpl })
    expect(result).toEqual({ status: 'fetch-error', reason: 'Failed to fetch' })
  })

  it('honours a base override', async () => {
    const fetchImpl = respond('key')
    await fetchKey(fprEntry(LONG_ID), { fetch: fetchImpl, base: 'https://keyserver.example.org' })
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://keyserver.example.org/vks/v1/by-keyid/${LONG_ID}`,
      expect.anything(),
    )
  })
})
