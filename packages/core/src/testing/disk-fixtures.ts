/** The mock's fixtures read from disk (repo root mock/data), for tests in Node. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureSource } from '../mock/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../mock/data');

export const diskFixtures: FixtureSource = (name, variant) => {
  try {
    return JSON.parse(readFileSync(resolve(root, name, `${variant}.json`), 'utf8'));
  } catch {
    return undefined;
  }
};
