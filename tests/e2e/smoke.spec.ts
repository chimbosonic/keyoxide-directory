import { expect, test } from '@playwright/test'

test('the built page loads and renders the directory heading', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Keyoxide Instance Directory',
  )
  await expect(page.getByRole('heading', { level: 2, name: 'Instances' })).toBeVisible()
})
