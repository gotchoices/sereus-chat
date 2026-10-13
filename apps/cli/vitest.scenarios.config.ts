import { defineConfig } from 'vitest/config';

// Scenarios spawn serchat processes and run for minutes: one at a time, long timeouts.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
