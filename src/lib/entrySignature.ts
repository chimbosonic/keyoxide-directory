/**
 * Consent, and where it is checked.
 *
 * Verification proves the operator controls the DNS of the host serving a
 * deployment. It never says they want to be listed here — the proof was
 * published for Keyoxide, not for this directory, and reading it is something
 * anyone can do on someone else's behalf. So an entry carries a signature, made
 * by the operator's key, over a string naming the deployment being listed.
 *
 * That signature is a merge-time gate, not a rendering state. It is checked by
 * `npm run verify:entries` in CI, where a pull request adding an entry can be
 * refused; the page never reads it, and no card status depends on it. Once an
 * entry is merged the directory has already taken the operator's word for it.
 */
import { createMessage, readKey, readSignature, verify } from 'openpgp'
import type { KeyMaterial } from './parseKey'

/**
 * Versioned, so the string can change later without an old signature silently
 * carrying over, and prefixed, so a signature made for some other purpose can
 * never be replayed as consent to be listed.
 */
export const CANONICAL_PREFIX = 'keyoxide-directory listing v1'

/**
 * What the operator signs.
 *
 * The instance is taken verbatim from the entry rather than normalised: the
 * signature covers what is written in `keys.json`, so editing the URL after the
 * fact — even in a way that resolves the same — invalidates it, which is the
 * point of signing the entry rather than the deployment.
 */
export function canonicalEntryString(instance: string): string {
  return `${CANONICAL_PREFIX}\ninstance=${instance}\n`
}

export type SignatureResult = { status: 'ok' } | { status: 'invalid'; reason: string }

/** `atob` is a global in both browsers and node; neither needs Buffer. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/**
 * Checks a detached signature over an entry against the operator's own key.
 *
 * The signature is stored base64-encoded rather than armored so that an entry
 * stays one line per field in the diff, the way `hash` and `fingerprint` do.
 */
export async function verifyEntrySignature(
  material: KeyMaterial,
  instance: string,
  signature: string,
): Promise<SignatureResult> {
  try {
    const verificationKeys = await (typeof material === 'string'
      ? readKey({ armoredKey: material })
      : readKey({ binaryKey: material }))

    const result = await verify({
      message: await createMessage({ text: canonicalEntryString(instance) }),
      signature: await readSignature({ binarySignature: decodeBase64(signature.trim()) }),
      verificationKeys,
      // The key names the deployment's domain; expiry of a uid is not this
      // check's business, and a rotated-but-valid signature should still pass.
      expectSigned: false,
    })

    const [signed] = result.signatures
    if (signed === undefined) return { status: 'invalid', reason: 'no signature in the blob' }

    // `verified` is a rejected promise on failure, which is why this is awaited
    // rather than read: openpgp reports a bad signature by throwing, not by a flag.
    await signed.verified
    return { status: 'ok' }
  } catch (error) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) }
  }
}
