/**
 * Standalone validation of src/data/keys.json, so CI can fail a pull request with
 * a clear message rather than burying it in test output. Run: npm run validate:keys
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { validateKeysFile } from '../src/lib/validateKeys.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '..', 'src', 'data')

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'))

const schema = readJson('keys.schema.json') as object
const data = readJson('keys.json')

const result = validateKeysFile(schema, data)

if (!result.valid) {
  console.error('src/data/keys.json is invalid:\n')
  for (const error of result.errors) console.error(`  - ${error}`)
  console.error('\nSee .github/pull_request_template.md for the expected entry shape.')
  process.exit(1)
}

const count = (data as { keys: unknown[] }).keys.length
console.log(`src/data/keys.json is valid (${count} ${count === 1 ? 'entry' : 'entries'}).`)
