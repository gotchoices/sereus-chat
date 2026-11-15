/**
 * The file layer must stay movable into its own package (gotchoices/sereus#62): its sources may
 * import each other and `@noble/hashes`, nothing from chat and nothing from the stack.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('file layer boundary', () => {
  it('imports only its own files and @noble/hashes', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(here)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = readFileSync(join(here, name), 'utf8');
      for (const m of source.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1];
        if (spec.startsWith('./') || spec.startsWith('@noble/hashes/')) continue;
        offenders.push(`${name}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
