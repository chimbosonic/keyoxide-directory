import type { DirectoryCard } from './resolve'

/**
 * The Keyoxide project's own deployments.
 *
 * They cannot arrive through the ordinary route. An entry earns its card by
 * carrying an `instance@dp42.dev` notation on an operator key, and the Keyoxide
 * project has no reason to sign a notation namespaced under this directory's
 * domain. Rather than leave the best-known deployments out of a directory of
 * deployments, they are pinned here.
 *
 * They are kept out of the verified count for the same reason: nothing about
 * them was verified, and counting them would inflate the figure.
 */
export const PROJECT_INSTANCES = ['https://keyoxide.org', 'https://dev.keyoxide.org']

export const projectCards: DirectoryCard[] = PROJECT_INSTANCES.map((instance) => ({
  declaredInstance: instance,
  claimedInstance: null,
  fingerprint: null,
  status: 'project',
}))
