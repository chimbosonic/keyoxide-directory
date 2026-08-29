import { probeAll, probeInstance } from './probe'

const URL_A = 'https://kx.example.org'
const URL_B = 'https://other.example.org'

const named = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

describe('probeInstance', () => {
  it('reports online when the request resolves', async () => {
    expect(await probeInstance(URL_A, { fetch: vi.fn(async () => new Response('')) })).toBe('online')
  })

  it('sends a no-cors request, since the deployment need not allow us', async () => {
    const fetchImpl = vi.fn(async () => new Response(''))
    await probeInstance(URL_A, { fetch: fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith(URL_A, expect.objectContaining({ mode: 'no-cors' }))
  })

  it('treats an opaque response as online, since nothing can be read from it', async () => {
    const opaque = vi.fn(async () => Response.error())
    expect(await probeInstance(URL_A, { fetch: opaque })).toBe('online')
  })

  it('reports unreachable when the connection fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await probeInstance(URL_A, { fetch: fetchImpl })).toBe('unreachable')
  })

  it('reports unknown on timeout, because slow is not dead', async () => {
    const fetchImpl = vi.fn(async () => {
      throw named('TimeoutError')
    })
    expect(await probeInstance(URL_A, { fetch: fetchImpl })).toBe('unknown')
  })

  it('reports unknown when the request is aborted', async () => {
    const fetchImpl = vi.fn(async () => {
      throw named('AbortError')
    })
    expect(await probeInstance(URL_A, { fetch: fetchImpl })).toBe('unknown')
  })

  it('passes an abort signal so a hung deployment cannot stall the page', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(''),
    )
    await probeInstance(URL_A, { fetch: fetchImpl, timeoutMs: 1000 })

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('probeAll', () => {
  it('keys each result by the URL probed', async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      if (String(input).includes('other')) throw new TypeError('Failed to fetch')
      return new Response('')
    })

    expect(await probeAll([URL_A, URL_B], { fetch: fetchImpl as never })).toEqual({
      [URL_A]: 'online',
      [URL_B]: 'unreachable',
    })
  })

  it('returns an empty map for no URLs', async () => {
    expect(await probeAll([])).toEqual({})
  })
})
