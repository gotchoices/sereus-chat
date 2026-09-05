#!/usr/bin/env sh
# logs.sh — stream the app's JS console to a file AND the terminal.
#
# WHY NOT `adb logcat -d`.  A snapshot reads the ring buffer, and the emulator
# fills that buffer with unrelated system chatter fast enough to evict our lines
# within seconds — so a snapshot taken a minute after boot shows an app that
# apparently logged nothing at all.  Stream it instead, from before the app
# starts.  (`*:S` silences every tag but ReactNativeJS.)
#
#   sh ./scripts/logs.sh [-d SERIAL] [outfile]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=$(cd "$HERE/.." && pwd)
. "$APP_DIR/env-defaults.sh"

S="$DEVICE_SERIAL"
if [ "${1:-}" = "-d" ]; then S="$2"; shift 2; fi
OUT="${1:-$APP_DIR/tmp/console.log}"
mkdir -p "$(dirname "$OUT")"

echo "==> streaming $S JS console to $OUT (ctrl-c to stop)"
adb -s "$S" logcat -c
exec adb -s "$S" logcat "*:S" ReactNativeJS:V | tee "$OUT"
