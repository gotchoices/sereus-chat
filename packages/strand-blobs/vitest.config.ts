import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // The IPFS compliance suites are mocha-style (global describe/it).
    globals: true,
    // Processed by vitest (not loaded as-is), so the `aegir/chai` alias reaches them.
    server: { deps: { inline: ['interface-blockstore-tests', 'interface-datastore-tests'] } }
  },
  resolve: {
    alias: { 'aegir/chai': fileURLToPath(new URL('./test-support/aegir-chai.ts', import.meta.url)) }
  }
})
