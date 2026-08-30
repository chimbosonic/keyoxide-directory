/**
 * Prints the keys.json source for an address, so a contributor never has to put
 * the address itself in the file. Run: npm run dane-hash you@example.org
 *
 * The address is an argument to a local command and goes nowhere: nothing here
 * touches the network, and only the hash is meant to be committed.
 */
import { daneHash } from '../src/lib/daneHash.ts'
import { daneName } from '../src/lib/dane.ts'

const [address] = process.argv.slice(2)

if (address === undefined) {
  console.error('usage: npm run dane-hash <address>')
  process.exit(1)
}

let identity
try {
  identity = daneHash(address)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

console.log(JSON.stringify({ type: 'dane', domain: identity.domain, hash: identity.hash }, null, 2))
console.error(
  `\nPublish your key as an OPENPGPKEY record at\n` +
    `\n    ${daneName(identity.domain, identity.hash)}\n` +
    `\nin a DNSSEC-signed zone, then add the above to your entry's sources.\n` +
    `\nNote that dig will usually show you nothing: the answer exceeds what UDP\n` +
    `carries, so check it over DNS-over-HTTPS the way the directory does.`,
)
