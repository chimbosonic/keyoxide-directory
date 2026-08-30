import type { DirectoryCard } from './resolve'

/**
 * keyoxide.org, the project's own deployment.
 *
 * It cannot arrive through the ordinary route. An entry earns its card by
 * carrying an `instance@dp42.dev` notation on an operator key, and the Keyoxide
 * project has no reason to sign a notation namespaced under this directory's
 * domain. Rather than leave the best-known deployment out of a directory of
 * deployments, it is pinned here.
 *
 * It is kept out of the verified count for the same reason: nothing was
 * verified, and counting it would inflate the figure.
 */
export const PROJECT_INSTANCE = 'https://keyoxide.org'

export const projectCard: DirectoryCard = {
  declaredInstance: PROJECT_INSTANCE,
  claimedInstance: null,
  fingerprint: null,
  status: 'project',
}
