import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  // Relative base so the built bundle works from any R2 prefix.
  base: './',
  build: {
    outDir: 'dist',
    // Flat static output: index.html plus hashed assets, no server routing.
    assetsDir: 'assets',
  },
  resolve: {
    // Svelte's browser build is required when components render under jsdom.
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
})
