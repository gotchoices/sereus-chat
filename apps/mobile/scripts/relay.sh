#!/usr/bin/env sh
# Local libp2p relay for two-instance testing.
#
# Two devices cannot dial each other directly: React Native cannot listen (no
# TCP/WS server), so `getMultiaddrs()` is empty and invitations refuse to mint.
# A relay fixes that without standing up a whole cadre node — both devices dial
# out to it and reach each other over `/p2p-circuit`.
#
# SOURCE OF THE RELAY
#   Today: built from the sereus clone at ops/docker/libp2p-infra, so we can
#   augment and debug it in place.
#   Later: once it ships in the sereus distribution, set RELAY_FROM=npx (or
#   change the default below) and delete the build branch — the rest of this
#   script does not change.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=$(cd "$HERE/.." && pwd)
CHAT_ROOT=$(cd "$APP_DIR/../.." && pwd)

# Ports and device serials live with the rest of the local config.
. "$APP_DIR/env-defaults.sh"

: "${RELAY_FROM:=source}"                       # source | npx
: "${SEREUS_DIR:=$(cd "$CHAT_ROOT/../sereus" 2>/dev/null && pwd || echo '')}"
: "${RELAY_TCP_PORT:=4001}"
: "${RELAY_WS_PORT:=4002}"
: "${SEREUS_ROLE:=bootstrap-relay}"
# Relayed connections are "limited" under the libp2p default, and optimystic's
# database services abort limited streams — peers would connect and then fail
# every read and write.  Off, always, for our purposes.
: "${RELAY_APPLY_DEFAULT_LIMIT:=false}"
# Identity lives here so the relay keeps the same peer id across restarts —
# devices pin /p2p/<peerId> in their relay address.
: "${DATA_DIR:=$CHAT_ROOT/.relay-data}"
: "${LISTEN_ADDRS:=/ip4/0.0.0.0/tcp/$RELAY_TCP_PORT,/ip4/0.0.0.0/tcp/$RELAY_WS_PORT/ws}"

export SEREUS_ROLE RELAY_APPLY_DEFAULT_LIMIT LISTEN_ADDRS DATA_DIR

case "$RELAY_FROM" in
  npx)
    # Placeholder for the published-package path.  Not available yet: the
    # package is `private: true` with no `bin`.
    echo "RELAY_FROM=npx is not available yet — the relay is not published." >&2
    exit 1
    ;;
  source)
    INFRA="$SEREUS_DIR/ops/docker/libp2p-infra"
    [ -d "$INFRA" ] || { echo "Cannot find $INFRA. Set SEREUS_DIR." >&2; exit 1; }

    # This package sits outside sereus's `packages/*` workspaces, so it installs
    # standalone.  npm, not yarn: the Dockerfile uses `npm install`, and yarn 4
    # refuses a package that is inside the project directory but not a workspace.
    # Reinstall when package.json is newer than the install, not just when
    # node_modules is absent: a pull that ADDS a dependency would otherwise
    # skip the install and fail in the build with a bare "cannot find module".
    # (PR #9 added @multiformats/multiaddr; it only built here because the dep
    # happened to be present already.)
    if [ ! -d "$INFRA/node_modules" ] || [ "$INFRA/package.json" -nt "$INFRA/node_modules" ]; then
      echo "==> installing relay dependencies"
      (cd "$INFRA" && npm install --silent)
    fi
    if [ ! -f "$INFRA/dist/main.js" ] || [ "$INFRA/src/main.ts" -nt "$INFRA/dist/main.js" ]; then
      echo "==> building relay"
      (cd "$INFRA" && npm run build)
    fi

    echo "==> relay: role=$SEREUS_ROLE limit=$RELAY_APPLY_DEFAULT_LIMIT"
    echo "    configure devices with: sh ./scripts/link.sh relay --all"
    echo

    # Tee into DATA_DIR so `link.sh relay` can read the peer id back rather than
    # making you copy it out of this terminal.  `exec` is gone on purpose: the
    # pipe needs a shell to keep the write end open.
    mkdir -p "$DATA_DIR"
    node --enable-source-maps "$INFRA/dist/main.js" 2>&1 | tee "$DATA_DIR/relay.log"
    ;;
  *)
    echo "Unknown RELAY_FROM=$RELAY_FROM (expected: source | npx)" >&2
    exit 1
    ;;
esac
