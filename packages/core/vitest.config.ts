import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The Sereus contract runs real nodes: formation, first sync and relay reservations
    // take seconds, not milliseconds.
    testTimeout: 120_000,
    hookTimeout: 240_000,
  },
});
