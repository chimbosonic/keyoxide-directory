import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * Every entry in keys.json, resolved for real: fetched from the keyserver or the
 * operator's WKD, parsed, and checked against the dns proofs on the key.
 *
 * `validate:keys` only proves an entry is well-formed. This proves it is true.
 * A typo'd hash, a key that was never published, a domain that stopped sending
 * CORS headers, or a proof withdrawn from a key all pass the schema and fail
 * here.
 */
// Read rather than imported: the file is the source of truth at run time, and
// Playwright's loader wants an import attribute for JSON that buys us nothing here.
const keysFile = JSON.parse(
  readFileSync(new URL('../../src/data/keys.json', import.meta.url), 'utf8'),
) as { keys: { type: string; instance: string }[] }

const entries = keysFile.keys

const LIVENESS = '[data-testid="liveness"]'

if (entries.length === 0) {
  test('nothing is listed yet, so there is nothing to resolve', () => {
    expect(entries).toHaveLength(0)
  })
}

for (const entry of entries) {
  test(`${entry.instance} verifies against its published key (${entry.type})`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')

    const card = page.locator(`article:has(> h3 > a[href="${entry.instance}"])`)
    await expect(card, `no card rendered for ${entry.instance}`).toHaveCount(1)

    // Generous, because this waits on a real keyserver or a real WKD host.
    await expect(card).toHaveAttribute('data-status', 'verified', { timeout: 30_000 })

    // Liveness is reported, never asserted: a deployment can be down for a day
    // without its claim being wrong, and that is not this check's business.
    const liveness = (await card.locator(LIVENESS).textContent())?.trim() ?? 'not probed'
    testInfo.annotations.push({ type: 'liveness', description: liveness })
    console.log(`  ${entry.instance}: ${liveness}`)
  })
}
