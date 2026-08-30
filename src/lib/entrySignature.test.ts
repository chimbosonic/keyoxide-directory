import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalEntryString, verifyEntrySignature } from './entrySignature'

const fixtureDir = resolve(__dirname, '../../tests/fixtures/keys')
const fixture = (name: string) => readFileSync(resolve(fixtureDir, name), 'utf8')

const INSTANCE = 'https://kx.example.org'

/**
 * A real `gpg --detach-sign` over the canonical string, so the check is
 * exercised against a signature GnuPG actually emits rather than one openpgp.js
 * made for itself. No secret key is committed: only the signature it produced.
 */
const SIGNATURE = fixture('proof.entry-sig.b64').trim()

describe('canonicalEntryString', () => {
  it('names the version and the instance, and ends with a newline', () => {
    expect(canonicalEntryString(INSTANCE)).toBe(
      'keyoxide-directory listing v1\ninstance=https://kx.example.org\n',
    )
  })

  it('takes the instance verbatim, so editing the entry breaks the signature', () => {
    expect(canonicalEntryString('https://kx.example.org/')).not.toBe(
      canonicalEntryString('https://kx.example.org'),
    )
  })
})

describe('verifyEntrySignature', () => {
  it('accepts a signature the entry’s own key made', async () => {
    expect(await verifyEntrySignature(fixture('proof.asc'), INSTANCE, SIGNATURE)).toEqual({
      status: 'ok',
    })
  })

  it('rejects a signature made over a different instance', async () => {
    const result = await verifyEntrySignature(fixture('proof.asc'), 'https://evil.example.org', SIGNATURE)
    expect(result.status).toBe('invalid')
  })

  it('rejects a signature made by another key', async () => {
    const result = await verifyEntrySignature(fixture('proofs.asc'), INSTANCE, SIGNATURE)
    expect(result.status).toBe('invalid')
  })

  it('rejects a tampered signature rather than throwing', async () => {
    const flipped = `${SIGNATURE.slice(0, 40)}${SIGNATURE[40] === 'A' ? 'B' : 'A'}${SIGNATURE.slice(41)}`
    const result = await verifyEntrySignature(fixture('proof.asc'), INSTANCE, flipped)

    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.reason).toBeTruthy()
  })

  it('rejects something that is not a signature at all', async () => {
    expect(await verifyEntrySignature(fixture('proof.asc'), INSTANCE, 'bm90IGEgc2ln')).toMatchObject(
      { status: 'invalid' },
    )
  })
})
