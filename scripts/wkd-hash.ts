/**
 * Prints the keys.json entry for an address, so a contributor never has to put
 * the address itself in the file. Run: npm run wkd-hash you@example.org
 *
 * The address is an argument to a local command and goes nowhere: nothing here
 * touches the network, and only the hash is meant to be committed.
 */
import { wkdHash } from '../src/lib/wkdHash.ts'

const [address, instance] = process.argv.slice(2)

if (address === undefined) {
  console.error('usage: npm run wkd-hash <address> [instance-url]')
  process.exit(1)
}

let identity
try {
  identity = wkdHash(address)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const entry = {
  type: 'wkd',
  domain: identity.domain,
  hash: identity.hash,
  instance: instance ?? 'https://kx.example.org',
}

console.log(JSON.stringify(entry, null, 2))
console.error(
  `\nPublish your key to ${identity.domain}'s Web Key Directory, then add the above to src/data/keys.json.`,
)
