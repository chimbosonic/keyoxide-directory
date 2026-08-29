/**
 * Keyoxide defines no notation for "the deployment I run" — doipjs reads only
 * `proof@ariadne.id` and its legacy alias `proof@metacode.biz`, both of which
 * carry identity proofs rather than deployment URLs. Keyoxide treats every
 * deployment as an interchangeable renderer over the same key, so it never
 * needed one.
 *
 * This directory therefore defines its own. RFC 9580 requires a notation name
 * be namespaced under a domain the definer controls.
 */
export const NOTATION_NAME = 'instance@dp42.dev'
