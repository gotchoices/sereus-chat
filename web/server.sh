#!/usr/bin/env bash
set -euo pipefail
# Preview the site locally at http://localhost:8080
#
# Note: python's http.server does no URL rewriting, so /invite/<token> won't
# resolve locally — open /invite.html directly to preview the invitation page.
# The production host rewrites /invite/* → /invite.html (see README.md).
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"
echo "Serving $ROOT_DIR at http://localhost:${PORT}  (Ctrl-C to stop)"
echo "  landing: http://localhost:${PORT}/"
echo "  invite:  http://localhost:${PORT}/invite.html?token=DEMO"
cd "$ROOT_DIR"
exec python3 -m http.server "$PORT"
