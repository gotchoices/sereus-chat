// profile-summary.mjs — where a V8 .cpuprofile's time went: idle against busy, then self
// time by package and by function.
//
//   node profile-summary.mjs <file.cpuprofile> [top=25]
import { readFileSync } from 'node:fs';

const [file, topArg = '25'] = process.argv.slice(2);
const top = Number(topArg);
const p = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n]));
// Self time per node from the sample stream (timeDeltas[i] is the time before sample i).
const self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
  self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + dt);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);

function pkg(url) {
  if (!url) return '(native/runtime)';
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(url);
  if (m) return m[1];
  if (/packages\/core|@chat\/core/.test(url)) return '@chat/core';
  return url.replace(/^.*\/(app|src|dist)\//, '$1/').slice(0, 60);
}
const special = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);
const byPkg = new Map(), byFn = new Map();
for (const [id, ms] of self) {
  const n = byId.get(id);
  const name = n.callFrame.functionName || '(anonymous)';
  const key = special.has(name) ? name : pkg(n.callFrame.url);
  byPkg.set(key, (byPkg.get(key) ?? 0) + ms);
  if (!special.has(name)) {
    const fk = `${name}  ${pkg(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
    byFn.set(fk, (byFn.get(fk) ?? 0) + ms);
  }
}
const pct = ms => `${(100 * ms / total).toFixed(1).padStart(5)}%`;
const idle = byPkg.get('(idle)') ?? 0;
console.log(`${file}: ${(total / 1000).toFixed(1)} s sampled; busy ${(100 * (total - idle) / total).toFixed(0)}%, idle ${(100 * idle / total).toFixed(0)}%`);
console.log('\nby package (self time):');
for (const [k, ms] of [...byPkg].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${pct(ms)} ${(ms / 1000).toFixed(2).padStart(7)} s  ${k}`);
console.log('\nby function (self time):');
for (const [k, ms] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${pct(ms)} ${(ms / 1000).toFixed(2).padStart(7)} s  ${k}`);
