#!/usr/bin/env bash
set -euo pipefail
# Preview the site locally, mirroring the production /chat path so the absolute
# /chat/... asset links resolve.  Served at http://localhost:8080/chat/
#
# Note: http.server does no URL rewriting, so /chat/invite/<token> won't resolve
# locally — open /chat/invite.html directly to preview the invitation page.
# Production rewrites /chat/invite/* → /chat/invite.html (see README.md).
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
ln -s "$ROOT_DIR" "$STAGE/chat"

echo "Serving $ROOT_DIR at http://localhost:${PORT}/chat/  (Ctrl-C to stop)"
echo "  landing: http://localhost:${PORT}/chat/"
echo "  invite:  http://localhost:${PORT}/chat/invite.html?token=DEMO"
cd "$STAGE"
exec python3 -m http.server "$PORT"
