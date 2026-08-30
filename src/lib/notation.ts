/**
 * The notations a key carries its proofs in, and the `dns:` claim inside them.
 *
 * doipjs reads two notation names: `proof@ariadne.id` and its legacy alias
 * `proof@metacode.biz`. Every proof a key carries lives under one of them, and a
 * key commonly carries several — one per identity the operator has proven. The
 * `dns:` claim is the one this directory reads: it names a domain, and a TXT
 * record in that domain names the key back.
 *
 * Reading Keyoxide's own notations rather than defining another one is what lets
 * an operator be listed here without touching their key at all.
 */
export const PROOF_NOTATION_NAMES = ['proof@ariadne.id', 'proof@metacode.biz']

/**
 * The directory's own notation, meaning "this is the deployment I run".
 *
 * Kept only until the proof route replaces it: it costs an operator a key edit
 * and a republish, which is the friction the proof route exists to remove.
 */
export const NOTATION_NAME = 'instance@dp42.dev'

/**
 * doipjs matches `dns:DOMAIN` with an optional query, and its own regex is
 * unanchored at the end. This one is anchored: a claim value that does not parse
 * whole is a malformed claim, and reading a domain out of its prefix would
 * confirm a domain the operator never wrote.
 */
const DNS_CLAIM = /^dns:([a-zA-Z0-9.\-_]+)(?:\?.*)?$/

/**
 * The domain a proof claim names, or null when the value is some other proof.
 *
 * A key's proofs are mostly Mastodon, XMPP and the like; those are not errors
 * here, just claims about something this directory does not read.
 */
export function parseDnsClaim(value: string): string | null {
  const match = DNS_CLAIM.exec(value.trim())
  if (match === null) return null

  // The root label is silent in a claim as it is in a URL, and a single label
  // cannot be a domain anyone publishes records under.
  const domain = match[1].replace(/\.+$/, '').toLowerCase()
  return domain.includes('.') ? domain : null
}
