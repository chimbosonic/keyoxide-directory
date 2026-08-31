import { expect, test, type Page } from '@playwright/test'

/**
 * Unlike the directory suite, this one loads the real compiled entries rather
 * than seeding its own. Those entries name deployments and domains that exist,
 * so every request off the preview server is refused here: the suite stays
 * offline and deterministic no matter what keys.json grows to contain.
 */
async function stayOffline(page: Page) {
  await page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url())
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? route.continue()
      : route.abort('connectionrefused')
  })
}

test('the built page loads and renders the directory heading', async ({ page }) => {
  await stayOffline(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Keyoxide Instance Directory',
  )
  await expect(page.getByRole('heading', { level: 2, name: 'Instances' })).toBeVisible()
})

test('the built page renders the compiled-in entries without reaching the network', async ({
  page,
}) => {
  await stayOffline(page)
  await page.goto('/')

  // Whatever keys.json holds, the pinned instances always render, and a blocked
  // lookup is reported rather than left spinning.
  await expect(page.locator('[data-status="project"]').first()).toBeVisible()
  await expect(page.getByTestId('loading')).toHaveCount(0)
})
