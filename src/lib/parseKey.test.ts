import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NOTATION_NAME } from './notation'
import { parseKey, selectNewestSelfCertification } from './parseKey'

/**
 * Fixtures are real keys generated with gpg in a throwaway GNUPGHOME, so the
 * parser is exercised against packets GnuPG actually emits rather than a
 * hand-rolled approximation. Their user ids use @example.invalid addresses.
 */
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../../tests/fixtures/keys', `${name}.asc`), 'utf8')

const CLAIMED_FPR = 'A78357EB843206292AD791A33D150A4804FDAB79'
const PLAIN_FPR = 'E9B57E7488818FE8A72CB8A20A6899A0D2FBBD4E'
const MULTI_FPR = '3A632274B46DD8E417096D31ABB959C77FE2ADF4'

describe('parseKey', () => {
  it('reads the instance notation off a claiming key', async () => {
    const result = await parseKey(fixture('claimed'))

    expect(result).toEqual({
      status: 'ok',
      key: { fingerprint: CLAIMED_FPR, instanceUrl: 'https://kx.example.org' },
    })
  })

  it('returns a null instance for a key carrying no notation', async () => {
    const result = await parseKey(fixture('plain'))

    expect(result).toEqual({
      status: 'ok',
      key: { fingerprint: PLAIN_FPR, instanceUrl: null },
    })
  })

  it('finds a notation on a user id other than the first', async () => {
    const result = await parseKey(fixture('multi'))

    expect(result).toEqual({
      status: 'ok',
      key: { fingerprint: MULTI_FPR, instanceUrl: 'https://kx.multi.example.org' },
    })
  })

  it('never exposes user ids or addresses', async () => {
    const result = await parseKey(fixture('multi'))
    expect(result.status).toBe('ok')

    if (result.status !== 'ok') return
    expect(Object.keys(result.key).sort()).toEqual(['fingerprint', 'instanceUrl'])
    expect(JSON.stringify(result.key)).not.toContain('example.invalid')
    expect(JSON.stringify(result.key)).not.toContain('Fixture')
  })

  it('reports an unreadable key rather than throwing', async () => {
    const result = await parseKey('not a key at all')

    expect(result.status).toBe('unreadable')
    if (result.status === 'unreadable') expect(result.reason).toBeTruthy()
  })

  it('reports a truncated armored block as unreadable', async () => {
    const result = await parseKey(fixture('claimed').slice(0, 120))
    expect(result.status).toBe('unreadable')
  })
})

describe('selectNewestSelfCertification', () => {
  const cert = (iso: string, notations: Record<string, string> = {}) => ({
    created: new Date(iso),
    notations,
  })

  it('returns undefined when there are no certifications', () => {
    expect(selectNewestSelfCertification([])).toBeUndefined()
  })

  it('returns the only certification when there is one', () => {
    const only = cert('2024-01-01T00:00:00Z')
    expect(selectNewestSelfCertification([only])).toBe(only)
  })

  it('picks the newest regardless of array order', () => {
    const older = cert('2024-01-01T00:00:00Z', { [NOTATION_NAME]: 'https://old.example.org' })
    const newer = cert('2025-06-01T00:00:00Z', { [NOTATION_NAME]: 'https://new.example.org' })

    expect(selectNewestSelfCertification([older, newer])).toBe(newer)
    expect(selectNewestSelfCertification([newer, older])).toBe(newer)
  })
})
