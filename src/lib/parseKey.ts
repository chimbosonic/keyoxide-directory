import { readKey } from 'openpgp'
import { PROOF_NOTATION_NAMES, parseDnsClaim } from './notation'

/**
 * What the directory needs from a key, and nothing more. User ids are
 * deliberately absent from this type: they are email addresses, and keeping
 * them out of the parse result means they cannot reach the DOM by accident.
 */
export interface ParsedKey {
  /** Uppercase hex, full length. */
  fingerprint: string
  /** Every domain the key's proof notations claim, deduped and sorted. */
  provenDomains: string[]
}

export type ParseResult =
  | { status: 'ok'; key: ParsedKey }
  | { status: 'unreadable'; reason: string }

/** The shape openpgp.js gives a notation subpacket, narrowed to what is read here. */
interface RawNotation {
  name: string
  value: Uint8Array
}

interface SelfCertification {
  created: Date
  rawNotations: RawNotation[]
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

/**
 * Every domain the key proves, scanning every user id.
 *
 * Read off `rawNotations` rather than the `notations` map, because that map is
 * keyed by name and so keeps only the last notation parsed under each. A key
 * with two `proof@ariadne.id` proofs — the ordinary case, one per identity —
 * would otherwise show up carrying one, chosen by subpacket order. The map also
 * drops notations not flagged human-readable, which `rawNotations` keeps.
 */
function findProvenDomains(
  users: readonly { selfCertifications: SelfCertification[] }[],
): string[] {
  const decoder = new TextDecoder()
  const domains = new Set<string>()

  for (const user of users) {
    const newest = selectNewestSelfCertification(user.selfCertifications ?? [])
    for (const notation of newest?.rawNotations ?? []) {
      if (!PROOF_NOTATION_NAMES.includes(notation.name)) continue

      const domain = parseDnsClaim(decoder.decode(notation.value))
      if (domain !== null) domains.add(domain)
    }
  }

  // Sorted so a key's proofs read the same way whatever order gpg wrote them in.
  return [...domains].sort()
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
    const users = key.users as unknown as { selfCertifications: SelfCertification[] }[]
    return {
      status: 'ok',
      key: {
        fingerprint: key.getFingerprint().toUpperCase(),
        provenDomains: findProvenDomains(users),
      },
    }
  } catch (error) {
    return {
      status: 'unreadable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
