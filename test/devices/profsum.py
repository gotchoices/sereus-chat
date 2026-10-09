#!/usr/bin/env python3
"""profsum.py <file.cpuprofile> [N] — rank functions by self and inclusive sample count.
Counts samples, not timeDeltas (Hermes occasionally records a bogus delta)."""
import json, sys, collections, re
p = json.load(open(sys.argv[1])); N = int(sys.argv[2]) if len(sys.argv) > 2 else 25
nodes = {n['id']: n for n in p['nodes']}; parent = {}
for n in p['nodes']:
    for c in n.get('children', []): parent[c] = n['id']
def name(n):
    cf = n['callFrame']; u = re.sub(r'.*node_modules/', '', cf.get('url', '') or ''); u = re.sub(r'http://localhost:\d+/index\.bundle.*', '', u)
    return f"{cf.get('functionName') or '(anon)'} {u}".strip()
self_c = collections.Counter(); incl = collections.Counter(); total = len(p['samples'])
for s in p['samples']:
    self_c[name(nodes[s])] += 1; seen = set(); cur = s
    while cur in nodes:
        k = name(nodes[cur])
        if k not in seen: incl[k] += 1; seen.add(k)
        cur = parent.get(cur)
        if cur is None: break
print(f"samples {total}")
print('--- self'); [print(f"{v/total*100:5.1f}% {k[:120]}") for k, v in self_c.most_common(N)]
skip = re.compile(r'^(\[root\]|\(anon\)|tryCallOne|tryCallTwo|doResolve|Promise|_next|asyncGeneratorStep|\[Native\] (generatorPrototypeNext|functionPrototypeApply|functionPrototypeCall))')
print('--- inclusive (wrappers hidden)'); [print(f"{v/total*100:5.1f}% {k[:120]}") for k, v in incl.most_common(N * 4) if not skip.match(k)][:N]
