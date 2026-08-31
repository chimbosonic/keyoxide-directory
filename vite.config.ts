import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // The lightweight build drops the curves we never touch; we only parse keys.
    // It is browser-only, so it is left out under Vitest, where library tests run
    // in node against the node build instead.
    alias: process.env.VITEST ? {} : { openpgp: 'openpgp/lightweight' },
  },
  // Relative base so the built bundle works from any R2 prefix.
  base: './',
  build: {
    outDir: 'dist',
    // Flat static output: index.html plus hashed assets, no server routing.
    assetsDir: 'assets',
  },
  test: {
    projects: [
      {
        // Library code runs under node. OpenPGP.js cannot be loaded in jsdom:
        // jsdom's Uint8Array belongs to a different realm, which fails the
        // instanceof checks inside its stream helpers at import time.
        extends: true,
        test: {
          name: 'lib',
          environment: 'node',
          globals: true,
          include: ['src/lib/**/*.test.ts'],
        },
      },
      {
        // Components need jsdom, and Svelte needs the browser export condition
        // to render there.
        extends: true,
        resolve: { conditions: ['browser'] },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          include: ['src/components/**/*.test.ts', 'tests/unit/**/*.test.ts'],
        },
      },
    ],
  },
})
