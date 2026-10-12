#!/usr/bin/env bash
set -euo pipefail
# Preview the site locally, mirroring the production /chat path so the absolute
# /chat/... asset links resolve.  Served at http://localhost:8080/chat/
#
# No rewrites are needed anywhere: invitations are /chat/invite/#<token>, served
# by invite/index.html, which reads the token after the '#' (see README.md).
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
ln -s "$ROOT_DIR" "$STAGE/chat"

echo "Serving $ROOT_DIR at http://localhost:${PORT}/chat/  (Ctrl-C to stop)"
echo "  landing: http://localhost:${PORT}/chat/"
echo "  invite:  http://localhost:${PORT}/chat/invite/#DEMO"
cd "$STAGE"
exec python3 -m http.server "$PORT"
