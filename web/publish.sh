#!/usr/bin/env bash
set -euo pipefail

# Publish the Sereus Chat static site + deep-link association files to
# https://chat.sereus.org/
#
# Usage:
#   ./publish.sh [USER@HOST] [DEST_PATH]
#   USER=myuser ./publish.sh [HOST] [DEST_PATH]
# Defaults:
#   HOST: gotchoices.org   (the host that serves the sereus.org sites)
#   USER: root             (override with USER env var or user@host arg)
#   DEST_PATH: /var/www/chat.sereus.org
#
# chat.sereus.org is a SUBDOMAIN vhost, so the site's root IS the web root:
# `.well-known/` lands at https://chat.sereus.org/.well-known/ directly.

HOST_ARG="${1:-gotchoices.org}"
if [[ "$HOST_ARG" == *"@"* ]]; then
  REMOTE="$HOST_ARG"
else
  USER="${USER:-root}"
  REMOTE="${USER}@${HOST_ARG}"
fi

DEST="${2:-/var/www/chat.sereus.org}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Publishing to ${REMOTE}:${DEST} ..."
ssh "$REMOTE" "mkdir -p '$DEST'"

EXCLUDES=(
  "--exclude" "publish.sh"
  "--exclude" "server.sh"
  "--exclude" "README.md"
  # The mobile APK is published separately (apps/mobile) into this same
  # directory. Exclude it so `--delete` here does not wipe it off the server.
  "--exclude" "chat.apk"
)

if command -v rsync >/dev/null 2>&1; then
  # NOTE: rsync copies files as-is. The server must serve
  #   .well-known/apple-app-site-association  as  application/json  (no ext, no redirect)
  # for iOS Universal Links to verify. See README.md.
  rsync -avz --delete "${EXCLUDES[@]}" "$ROOT_DIR/" "$REMOTE:$DEST/"
else
  echo "rsync not found; using scp (excludes ignored). Consider installing rsync."
  scp -r "$ROOT_DIR"/* "$REMOTE:$DEST/"
fi

echo "Publish complete: https://chat.sereus.org/"
echo "Verify: https://chat.sereus.org/.well-known/assetlinks.json"
echo "        https://chat.sereus.org/.well-known/apple-app-site-association"
