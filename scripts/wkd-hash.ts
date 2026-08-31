/**
 * Prints the keys.json source for an address, so a contributor never has to put
 * the address itself in the file. Run: npm run wkd-hash you@example.org
 *
 * The address is an argument to a local command and goes nowhere: nothing here
 * touches the network, and only the hash is meant to be committed.
 */
import { wkdHash } from '../src/lib/wkdHash.ts'

const [address] = process.argv.slice(2)

if (address === undefined) {
  console.error('usage: npm run wkd-hash <address>')
  process.exit(1)
}

let identity
try {
  identity = wkdHash(address)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

console.log(JSON.stringify({ type: 'wkd', domain: identity.domain, hash: identity.hash }, null, 2))
console.error(
  `\nPublish your key to ${identity.domain}'s Web Key Directory, with CORS headers` +
    `\non the /.well-known/openpgpkey/ path, then add the above to your entry's sources.`,
)
