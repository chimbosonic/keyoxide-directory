import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFileSync(resolve(here, '../fixtures/keys', `${name}.asc`), 'utf8')

const CLAIMED = 'A78357EB843206292AD791A33D150A4804FDAB79'
const PLAIN = 'E9B57E7488818FE8A72CB8A20A6899A0D2FBBD4E'
const MISSING = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'

/**
 * The keyserver is intercepted so the suite is deterministic and runs offline;
 * everything below the network — the real bundle, OpenPGP.js, the notation read
 * and the status classification — runs for real.
 */
async function stubKeyserver(page: Page) {
  await page.route('**/keys.openpgp.org/**', async (route) => {
    const url = route.request().url()

    if (url.includes(CLAIMED)) {
      return route.fulfill({ status: 200, contentType: 'application/pgp-keys', body: fixture('claimed') })
    }
    if (url.includes(PLAIN)) {
      return route.fulfill({ status: 200, contentType: 'application/pgp-keys', body: fixture('plain') })
    }
    return route.fulfill({ status: 404, body: '' })
  })
}

const ENTRIES = [
  { fingerprint: CLAIMED, instance: 'https://kx.example.org' },
  { fingerprint: CLAIMED, instance: 'https://elsewhere.example.org' },
  { fingerprint: PLAIN, instance: 'https://plain.example.org' },
  { fingerprint: MISSING, instance: 'https://gone.example.org' },
]

async function loadDirectory(page: Page, entries: unknown[] = ENTRIES) {
  await stubKeyserver(page)
  await page.addInitScript((seed) => {
    ;(window as unknown as Record<string, unknown>)['__KEYOXIDE_DIRECTORY_ENTRIES__'] = seed
  }, entries)
  await page.goto('/')
}

test.describe('directory', () => {
  test('renders one card per entry', async ({ page }) => {
    await loadDirectory(page)

    await expect(page.getByTestId('instances')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(ENTRIES.length)
  })

  test('verifies a key whose notation matches the declared deployment', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="verified"]')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('verification')).toContainText('verified')
    await expect(card.getByTestId('key-id')).toHaveText('0x3D15 0A48 04FD AB79')
    await expect(card.getByRole('link')).toHaveAttribute('href', 'https://kx.example.org')
  })

  test('flags a key that claims a different deployment', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="mismatch"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('kx.example.org')
  })

  test('flags a key carrying no claim', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="no-notation"]')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('verification')).toContainText('no claim on key')
  })

  test('flags a key the keyserver does not have', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="not-found"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('key not retrieved')
  })

  test('summarises the verified count', async ({ page }) => {
    await loadDirectory(page)

    await expect(page.getByTestId('summary')).toHaveText('1 of 4 verified')
  })

  test('never renders an operator address or a full fingerprint', async ({ page }) => {
    await loadDirectory(page)
    await expect(page.getByTestId('instances')).toBeVisible()

    const body = (await page.locator('body').textContent()) ?? ''
    expect(body).not.toContain('example.invalid')
    expect(body).not.toContain('Fixture')
    expect(body).not.toContain(CLAIMED)
    expect(body).not.toContain(PLAIN)
  })

  test('shows the empty state when nothing is listed', async ({ page }) => {
    await loadDirectory(page, [])

    await expect(page.getByTestId('empty')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)
  })
})
