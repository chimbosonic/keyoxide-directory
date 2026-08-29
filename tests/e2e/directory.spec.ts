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
  { type: 'hkp', fingerprint: CLAIMED, instance: 'https://kx.example.org' },
  { type: 'hkp', fingerprint: CLAIMED, instance: 'https://elsewhere.example.org' },
  { type: 'hkp', fingerprint: PLAIN, instance: 'https://plain.example.org' },
  { type: 'hkp', fingerprint: MISSING, instance: 'https://gone.example.org' },
]

/**
 * Deployments are stubbed too, so the suite never touches the real network:
 * one answers, one refuses the connection.
 */
async function stubDeployments(page: Page) {
  // The pinned project instance is a real deployment, so it is stubbed too and
  // the suite still reaches nothing outside the browser.
  await page.route('**/keyoxide.org/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
  await page.route('**/kx.example.org/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
  await page.route('**/plain.example.org/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
  await page.route('**/elsewhere.example.org/**', (route) => route.abort('connectionrefused'))
  await page.route('**/gone.example.org/**', (route) => route.abort('connectionrefused'))
}

async function loadDirectory(page: Page, entries: unknown[] = ENTRIES) {
  await stubKeyserver(page)
  await stubDeployments(page)
  await page.addInitScript((seed) => {
    ;(window as unknown as Record<string, unknown>)['__KEYOXIDE_DIRECTORY_ENTRIES__'] = seed
  }, entries)
  await page.goto('/')
}

test.describe('directory', () => {
  test('renders one card per entry', async ({ page }) => {
    await loadDirectory(page)

    await expect(page.getByTestId('instances')).toBeVisible()
    // One per entry, plus the pinned project instance leading the grid.
    await expect(page.getByRole('article')).toHaveCount(ENTRIES.length + 1)
    await expect(page.getByRole('article').first()).toContainText('keyoxide.org')
  })

  test('pins keyoxide.org without counting it as verified', async ({ page }) => {
    await loadDirectory(page)

    const pinned = page.locator('[data-status="project"]')
    await expect(pinned).toHaveCount(1)
    await expect(pinned.getByRole('link')).toHaveAttribute('href', 'https://keyoxide.org')
    await expect(pinned.getByTestId('verification')).toContainText('project instance')
    await expect(page.getByTestId('summary')).toHaveText(`1 of ${ENTRIES.length} verified`)
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

  test('shows the empty state when nothing is listed, alongside the pinned card', async ({
    page,
  }) => {
    await loadDirectory(page, [])

    await expect(page.getByTestId('empty')).toBeVisible()
    // The directory is never truly empty: the pinned instance always renders.
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.locator('[data-status="project"]')).toBeVisible()
    await expect(page.getByTestId('summary')).toHaveText('0 of 0 verified')
  })

  test('marks a deployment that answers as online', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="verified"]')
    await expect(card.getByTestId('liveness')).toHaveText('online')
  })

  test('marks a deployment that refuses the connection as unreachable', async ({ page }) => {
    await loadDirectory(page)

    const card = page.locator('[data-status="mismatch"]')
    await expect(card.getByTestId('liveness')).toHaveText('unreachable')
  })

  test('probes independently of verification', async ({ page }) => {
    await loadDirectory(page)

    // The key claims nothing, but the deployment itself is up.
    const card = page.locator('[data-status="no-notation"]')
    await expect(card.getByTestId('verification')).toContainText('no claim on key')
    await expect(card.getByTestId('liveness')).toHaveText('online')
  })
})
