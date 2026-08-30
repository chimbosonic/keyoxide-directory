/**
 * Checks that every entry in src/data/keys.json was signed by the key it names.
 *
 * This is the consent gate. Verification proves an operator controls the DNS of
 * the host serving a deployment, which anyone can read on their behalf; the
 * signature is how the operator says they want to be listed. It is checked here,
 * at merge time, rather than in the page: a reviewer can refuse a pull request,
 * and a visitor could do nothing with the answer.
 *
 * Talks to real keyservers and real operator domains, so it belongs alongside
 * test:entries rather than in CI's default path. Run: npm run verify:entries
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { canonicalEntryString, verifyEntrySignature } from '../src/lib/entrySignature.ts'
import { fetchDaneKey } from '../src/lib/dane.ts'
import { fetchKey } from '../src/lib/keyserver.ts'
import { fetchWkdKey } from '../src/lib/wkd.ts'
import { orderedSources, sourceIdentity, type KeyEntry, type KeySource } from '../src/lib/validateKeys.ts'
import { parseKey } from '../src/lib/parseKey.ts'
import type { KeyMaterial } from '../src/lib/parseKey.ts'

type SignedEntry = KeyEntry & { signature?: string }

type Material = { status: 'ok'; key: KeyMaterial } | { status: 'error'; reason: string }

/**
 * The same routing resolveEntry does, repeated rather than imported: resolve.ts
 * reaches the rest of the browser code through extensionless specifiers node
 * cannot resolve, while the fetchers are leaves it can.
 */
async function fetchFrom(source: KeySource): Promise<Material> {
  if (source.type === 'hkp') {
    const fetched = await fetchKey(source)
    return fetched.status === 'ok'
      ? { status: 'ok', key: fetched.armored }
      : { status: 'error', reason: fetched.status === 'not-found' ? 'not on the keyserver' : fetched.reason }
  }

  if (source.type === 'dane') {
    const fetched = await fetchDaneKey(source.domain, source.hash)
    if (fetched.status === 'ok') return { status: 'ok', key: fetched.key }

    return {
      status: 'error',
      reason:
        fetched.status === 'not-found'
          ? `no openpgpkey record at ${source.domain}`
          : fetched.status === 'unvalidated'
            ? `${source.domain} is not a dnssec-signed zone`
            : fetched.reason,
    }
  }

  const fetched = await fetchWkdKey(source.domain, source.hash)
  return fetched.status === 'ok'
    ? { status: 'ok', key: fetched.key }
    : { status: 'error', reason: fetched.status === 'not-found' ? `not published at ${source.domain}` : fetched.reason }
}

const keysFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'keys.json')
const entries = (JSON.parse(readFileSync(keysFile, 'utf8')) as { keys: SignedEntry[] }).keys

const failures: string[] = []

for (const [index, entry] of entries.entries()) {
  const label = `keys/${index} (${entry.instance})`

  // The schema requires the field, so reaching here without one means the file
  // was hand-edited past validate:keys rather than that the operator forgot.
  if (entry.signature === undefined) {
    failures.push(`${label}: no signature`)
    continue
  }

  // Every source, not just the first the page would settle for: they are meant
  // to be one key in several places, and nothing else checks that they are.
  let fingerprint: string | null = null

  for (const source of orderedSources(entry)) {
    const where = `${label} ${sourceIdentity(source)}`

    const fetched = await fetchFrom(source)
    if (fetched.status !== 'ok') {
      failures.push(`${where}: ${fetched.reason}`)
      continue
    }

    const parsed = await parseKey(fetched.key)
    if (parsed.status !== 'ok') {
      failures.push(`${where}: the key could not be parsed (${parsed.reason})`)
      continue
    }

    if (fingerprint !== null && parsed.key.fingerprint !== fingerprint) {
      failures.push(`${where}: serves a different key from the entry's other sources`)
      continue
    }
    fingerprint = parsed.key.fingerprint

    const verified = await verifyEntrySignature(fetched.key, entry.instance, entry.signature)
    if (verified.status !== 'ok') {
      failures.push(`${where}: the signature does not verify (${verified.reason})`)
      continue
    }

    console.log(`OK ${where}`)
  }
}

if (failures.length > 0) {
  console.error('\nsrc/data/keys.json has entries whose signature does not check out:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '\nAn entry is signed over exactly this string, with the instance as written:\n' +
      `\n    ${JSON.stringify(canonicalEntryString('https://kx.example.org'))}\n` +
      '\nSee .github/pull_request_template.md for the command that produces it.',
  )
  process.exit(1)
}

const noun = entries.length === 1 ? '1 entry verifies' : `all ${entries.length} entries verify`
console.log(`\nSigned by the key it names: ${noun}.`)
