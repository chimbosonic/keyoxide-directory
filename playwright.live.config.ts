import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

/**
 * The live check: does every entry in keys.json actually resolve?
 *
 * Kept in its own config, and on its own port, because it is the one suite that
 * is *supposed* to touch the network. The offline suites stub everything so they
 * stay deterministic; this one deliberately does not, because a stubbed check
 * would tell us nothing about whether a listed operator's key is really there.
 *
 * It runs against the production build in a real browser, so it exercises the
 * openpgp/lightweight bundle a visitor gets rather than the full node build the
 * unit tests use — a key that parses under one and not the other shows up here.
 */
export default defineConfig({
  testDir: './tests/live',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky network is not a broken entry. A genuinely wrong entry fails all three.
  retries: 2,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
