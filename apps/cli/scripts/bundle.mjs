// Bundles serchat into one file, dist/serchat.js. Chat's own packages (@chat/core,
// @chat/resources) are bundled in, so the published package needs nothing unpublished;
// the stack stays external — the `dependencies` npm installs beside it — so there is one
// copy of it and its native-free packages load as they are.
import { build } from 'esbuild';
import { chmodSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).flatMap(name => [name, `${name}/*`]);

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/serchat.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  banner: { js: '#!/usr/bin/env node' },
  define: { SERCHAT_VERSION: JSON.stringify(pkg.version) },
  logLevel: 'warning',
});
chmodSync('dist/serchat.js', 0o755);
