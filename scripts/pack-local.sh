#!/usr/bin/env bash
#
# chat/scripts/pack-local.sh — build the stack packages that are not on npm yet (today
# @serfab/cadre-client) in their ser/ clone, and pack each into .local-packages/, where
# scripts/use-stack.sh points the consumers (`file:` tarballs).
#
# A tarball, not a portal or link: installed by copy, the package's peer dependency
# (@serfab/cadre-core) resolves from the app's own node_modules. Through a link it would resolve
# from the clone's, a second copy (two CadreNode types, `instanceof` failing across them).
#
# After changing cadre-client in the clone: run this, then `yarn install` in each consumer
# (bash scripts/use-stack.sh npm --install does both). Drop a package from here and from
# use-stack.sh's LOCAL_ONLY once a sereus release includes it.
#
#   bash scripts/pack-local.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SER="$(cd "$ROOT/.." && pwd)"
OUT="$ROOT/.local-packages"
mkdir -p "$OUT"

pack() { # <clone-relative package dir> <tarball name>
  local dir="$SER/$1"
  [ -f "$dir/package.json" ] || { echo "missing $dir (clone sereus beside chat; ser/pull-stack.sh)" >&2; exit 1; }
  echo "==> build + pack $1"
  (cd "$dir" && yarn build >/dev/null && yarn pack --out "$OUT/$2" >/dev/null)
  echo "    $OUT/$2"
}

pack sereus/packages/cadre-client serfab-cadre-client.tgz
