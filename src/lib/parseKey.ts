import { readKey } from 'openpgp'
import { NOTATION_NAME } from './notation'

/**
 * What the directory needs from a key, and nothing more. User ids are
 * deliberately absent from this type: they are email addresses, and keeping
 * them out of the parse result means they cannot reach the DOM by accident.
 */
export interface ParsedKey {
  /** Uppercase hex, full length. */
  fingerprint: string
  /** The deployment claimed by the notation, or null when the key carries none. */
  instanceUrl: string | null
}

export type ParseResult =
  | { status: 'ok'; key: ParsedKey }
  | { status: 'unreadable'; reason: string }

interface SelfCertification {
  created: Date
  notations: Record<string, string>
}

/**
 * A user id can carry several self-certifications; only the most recent one
 * describes the operator's current intent. This mirrors doipjs, which sorts and
 * takes the newest rather than the first it encounters.
 */
export function selectNewestSelfCertification<T extends { created: Date }>(
  certifications: readonly T[],
): T | undefined {
  return certifications.reduce<T | undefined>(
    (newest, candidate) =>
      newest === undefined || candidate.created > newest.created ? candidate : newest,
    undefined,
  )
}

/** Reads the instance notation off a key, scanning every user id. */
function findInstanceUrl(users: readonly { selfCertifications: SelfCertification[] }[]): string | null {
  for (const user of users) {
    const newest = selectNewestSelfCertification(user.selfCertifications ?? [])
    const claimed = newest?.notations?.[NOTATION_NAME]
    if (typeof claimed === 'string' && claimed.length > 0) return claimed
  }
  return null
}

/**
 * The two transports hand us different things: the keyserver returns an armored
 * block, while WKD serves raw packets with no armor at all. Rather than armor
 * the bytes back up just to parse them, the caller passes whichever it has.
 */
export type KeyMaterial = string | Uint8Array

/**
 * Parses a public key, armored or binary. Returns `unreadable` rather than
 * throwing, because a malformed key is a rendering state, not a crash.
 */
export async function parseKey(material: KeyMaterial): Promise<ParseResult> {
  try {
    // Branched rather than passed a union: readKey is overloaded, and an
    // `armoredKey | binaryKey` union satisfies neither overload.
    const key =
      typeof material === 'string'
        ? await readKey({ armoredKey: material })
        : await readKey({ binaryKey: material })
    return {
      status: 'ok',
      key: {
        fingerprint: key.getFingerprint().toUpperCase(),
        instanceUrl: findInstanceUrl(
          key.users as unknown as { selfCertifications: SelfCertification[] }[],
        ),
      },
    }
  } catch (error) {
    return {
      status: 'unreadable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
