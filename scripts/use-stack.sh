#!/usr/bin/env bash
#
# chat/scripts/use-stack.sh — one place that sets which Sereus stack every consumer in
# this repo uses (@optimystic/*, @quereus/*, @serfab/*, p2p-fret, and the libp2p
# single-copy pins), so the core is never tested against one stack and shipped with
# another.
#
# Consumers (each package.json found here is rewritten together):
#   .              the workspace root: `resolutions` for packages/* and test/stack
#   apps/*         each app: `dependencies` and its own `resolutions` (apps are not
#                  workspace members; see docs/app-family.md) — except an app the root
#                  lists in its workspaces (apps/cli), which gets `dependencies` only
#   test/stack     workspace member: `dependencies`
#   packages/*     workspace members: `peerDependencies` (ranges) and `devDependencies`
#
# Modes:
#   npm    — EXACT published versions (the table below). The default.
#   local  — yarn `portal:` specs to the clones under ser/ (sereus, optimystic,
#            quereus, fret), for co-developing a stack package. Requires the clones
#            to be present and built (../pull-stack.sh). Peer ranges stay as they are.
#
# Only names already present in a consumer's dependency blocks are rewritten; an app
# that does not use @serfab/cadre-rn does not gain it. The ser block and the libp2p
# pins are written into every resolutions owner (the root and each app).
#
# Usage:
#   bash scripts/use-stack.sh                 # status: mode and specs per consumer
#   bash scripts/use-stack.sh npm|local       # rewrite every consumer
#   bash scripts/use-stack.sh npm --install   # and run `yarn install` at the root and in each app
#
# To adopt a newer stack: change the versions in PACKAGES (and COMPAT_PINS if the
# stack's libp2p line moved), run `npm --install`, then validate with the core's tests
# and test/stack before touching an app. For iOS also run `pod install` in the app.
#
# apps/mobile/metro.config.js reads the app's package.json to decide whether to alias
# the stack to local source, so it follows the mode with no second switch.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-status}"
DO_INSTALL=0
for arg in "$@"; do
  case "$arg" in --install) DO_INSTALL=1 ;; esac
done

case "$CMD" in
  local|npm|status) ;;
  -h|--help) sed -n '2,34p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "use-stack.sh: unknown command '$CMD' (expected: local | npm | status)" >&2; exit 2 ;;
esac

ROOT="$ROOT" MODE="$CMD" python3 - <<'PY' || exit $?
import collections, glob, json, os, sys

ROOT = os.environ['ROOT']
MODE = os.environ['MODE']
SER = os.path.dirname(ROOT)  # the ser/ folder holding the clones

# name : (clone path under ser/, exact version, pinned in resolutions)
PACKAGES = collections.OrderedDict([
    ('@optimystic/db-core',                   ('optimystic/packages/db-core',                   '1.19.0', True)),
    ('@optimystic/db-p2p',                    ('optimystic/packages/db-p2p',                    '1.19.0', True)),
    ('@optimystic/db-p2p-storage-rn',         ('optimystic/packages/db-p2p-storage-rn',         '1.19.0', True)),
    ('@optimystic/db-p2p-storage-fs',         ('optimystic/packages/db-p2p-storage-fs',         '1.19.0', True)),
    ('@optimystic/db-p2p-storage-ns',         ('optimystic/packages/db-p2p-storage-ns',         '1.19.0', True)),
    ('@optimystic/quereus-plugin-crypto',     ('optimystic/packages/quereus-plugin-crypto',     '1.19.0', True)),
    ('@optimystic/quereus-plugin-optimystic', ('optimystic/packages/quereus-plugin-optimystic', '1.19.0', True)),
    ('@quereus/quereus',                      ('quereus/packages/quereus',                      '4.20.3', True)),
    ('@serfab/cadre-core',                    ('sereus/packages/cadre-core',                    '1.19.0', True)),
    ('@serfab/cadre-rn',                      ('sereus/packages/cadre-rn',                      '1.19.0', False)),
    ('p2p-fret',                              ('fret/packages/fret',                            '1.2.1',  True)),
])
SENTINEL = '@serfab/cadre-core'

# Non-ser single-copy pins, written into every resolutions owner: one copy of each in
# a bundle, for type identity (`instanceof`, transport registration).
#   name : (local value, npm value)
COMPAT_PINS = collections.OrderedDict([
    ('@libp2p/interface',       ('npm:3.3.0',  'npm:3.3.0')),
    ('@libp2p/peer-id',         ('npm:6.0.15', 'npm:6.0.15')),
    ('@multiformats/multiaddr', ('13.0.3',     '13.0.3')),
    ('libp2p',                  ('npm:3.3.11', 'npm:3.3.11')),
    ('@noble/hashes',           ('npm:2.0.1',  'npm:2.2.0')),
])

def consumers():
    found = [('.', 'root')]
    # An app listed in the root's workspaces (apps/cli) is a member: the root's
    # resolutions govern it, so it gets dependencies only.
    members = set(load('.').get('workspaces', []))
    for pj in sorted(glob.glob(os.path.join(ROOT, 'apps', '*', 'package.json'))):
        rel = os.path.relpath(os.path.dirname(pj), ROOT)
        found.append((rel, 'member' if rel in members else 'app'))
    if os.path.exists(os.path.join(ROOT, 'test', 'stack', 'package.json')):
        found.append(('test/stack', 'member'))
    for pj in sorted(glob.glob(os.path.join(ROOT, 'packages', '*', 'package.json'))):
        found.append((os.path.relpath(os.path.dirname(pj), ROOT), 'package'))
    return found

def load(rel):
    with open(os.path.join(ROOT, rel, 'package.json')) as f:
        return json.load(f, object_pairs_hook=collections.OrderedDict)

def spec_for(rel, name, mode):
    clone, version, _ = PACKAGES[name]
    if mode == 'local':
        return 'portal:' + os.path.relpath(os.path.join(SER, clone), os.path.join(ROOT, rel))
    return version

def mode_of(p):
    for block in ('dependencies', 'devDependencies', 'resolutions'):
        spec = (p.get(block) or {}).get(SENTINEL)
        if spec is not None:
            return 'local' if str(spec).startswith('portal:') else 'npm'
    return '—'

if MODE == 'status':
    for rel, kind in consumers():
        p = load(rel)
        print(f"{rel} ({kind}): {mode_of(p)}")
        for block in ('dependencies', 'devDependencies', 'peerDependencies', 'resolutions'):
            b = p.get(block) or {}
            names = [n for n in list(PACKAGES) + list(COMPAT_PINS) if n in b]
            for n in names:
                print(f"    {block:<17s} {n:<40s} {b[n]}")
    sys.exit(0)

for rel, kind in consumers():
    p = load(rel)
    for block in ('dependencies', 'devDependencies'):
        b = p.get(block)
        if not b:
            continue
        for name in PACKAGES:
            if name in b:
                b[name] = spec_for(rel, name, MODE)
    peers = p.get('peerDependencies')
    if peers and MODE == 'npm':
        for name in PACKAGES:
            if name in peers:
                peers[name] = '^' + PACKAGES[name][1]
    if kind in ('root', 'app'):
        res = p.get('resolutions') or collections.OrderedDict()
        rest = collections.OrderedDict(
            (k, v) for k, v in res.items() if k not in PACKAGES and k not in COMPAT_PINS)
        new = collections.OrderedDict()
        for name, (_, _, in_res) in PACKAGES.items():
            if in_res:
                new[name] = spec_for(rel, name, MODE)
        for name, (local_val, npm_val) in COMPAT_PINS.items():
            new[name] = local_val if MODE == 'local' else npm_val
        new.update(rest)
        p['resolutions'] = new
    with open(os.path.join(ROOT, rel, 'package.json'), 'w') as f:
        json.dump(p, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f"{rel}: {MODE}")
PY

if [ "$CMD" != status ] && [ "$DO_INSTALL" = 1 ]; then
  echo "==> yarn install (root)"
  (cd "$ROOT" && yarn install) || exit $?
  for app in "$ROOT"/apps/*/; do
    [ -f "$app/package.json" ] || continue
    echo "==> yarn install ($(basename "$app"))"
    (cd "$app" && yarn install) || exit $?
  done
  echo "For iOS also run: (cd apps/mobile/ios && pod install)"
fi
