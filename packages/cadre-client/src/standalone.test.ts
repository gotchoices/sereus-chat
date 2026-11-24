/**
 * The package stays liftable: it imports cadre-core and itself, nothing of chat's, no UI
 * framework and no platform module. Moving it into its own repository, or into sereus,
 * must not need a single import changed.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('.', import.meta.url).pathname;
const ALLOWED = [/^\.\.?\//, /^@serfab\/cadre-core(\/edge-node)?$/, /^vitest$/, /^node:/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('standalone', () => {
  it('imports nothing but cadre-core and its own files', () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const isTest = file.endsWith('.test.ts');
      for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+'([^']+)'/g)) {
        const allowed = ALLOWED.some(rule => rule.test(spec)) && (isTest || !/^(vitest|node:)/.test(spec));
        if (!allowed) offenders.push(`${file.slice(SRC.length)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
