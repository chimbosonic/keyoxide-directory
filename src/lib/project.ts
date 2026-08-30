import type { DirectoryCard } from './resolve'

/**
 * The Keyoxide project's own deployments.
 *
 * They cannot arrive through the ordinary route. An entry is listed on the
 * operator's signature over it, saying they want the card; the Keyoxide project
 * has signed nothing of the sort, and this directory is not theirs to be
 * enrolled in on their behalf. Rather than leave the best-known deployments out
 * of a directory of deployments, they are pinned here.
 *
 * They are kept out of the verified count for the same reason: nothing about
 * them was verified, and counting them would inflate the figure.
 */
export const PROJECT_INSTANCES = ['https://keyoxide.org', 'https://dev.keyoxide.org']

export const projectCards: DirectoryCard[] = PROJECT_INSTANCES.map((instance) => ({
  declaredInstance: instance,
  provenDomains: [],
  confirmedVia: null,
  fingerprint: null,
  status: 'project',
}))
