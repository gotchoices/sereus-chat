import { defineConfig } from 'vitest/config';

// Unit tests only; the scenario suite (test/, real processes, minutes) has its own config.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
