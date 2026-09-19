#!/usr/bin/env sh
# link.sh — send a deep link to a running instance.
#
# The app is driven by links (invitations, relay offers), and in development
# there is often no browser or QR code in the loop — so this stands in for the
# tap that would otherwise deliver one.
#
# WHY NOT JUST `adb shell am start -d "$URL"`.  `adb shell` hands the command to
# a shell ON THE DEVICE, which re-parses it.  An unquoted `&` in a query string
# is a background operator there, so `?addr=X&name=Y` silently arrives as
# `?addr=X` — the link works, with a parameter missing, which is worse than
# failing.  Every URL below is single-quoted for that second shell.
#
#   link.sh relay [--all | -d SERIAL]   configure the local relay (scripts/relay.sh)
#   link.sh reverse [--all | -d SERIAL] adb-reverse Metro + relay for a USB device
#   link.sh '<url>' [--all | -d SERIAL] send any deep link
#   link.sh devices                     list attached devices
#
# Default target is $DEVICE_SERIAL (see env-defaults.sh / .env.ports.local);
# `--all` targets every attached device, which is the two-instance pair.
# For a one-off elsewhere, `TARGET_DEVICE=<serial> sh ./scripts/link.sh …` — and a
# plain exported DEVICE_SERIAL deliberately does NOT win (env-defaults.sh says why).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=$(cd "$HERE/.." && pwd)
CHAT_ROOT=$(cd "$APP_DIR/../.." && pwd)

. "$APP_DIR/env-defaults.sh"

: "${RELAY_WS_PORT:=4002}"
: "${DATA_DIR:=$CHAT_ROOT/.relay-data}"
: "${APP_ID:=org.sereus.chat}"

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# ── target selection ───────────────────────────────────────────────────────
targets_from_args() {
  _all=no; _serial=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --all) _all=yes ;;
      -d|--device) shift; _serial="${1:-}" ;;
    esac
    shift
  done
  if [ "$_all" = yes ]; then
    adb devices | awk '/\tdevice$/ { print $1 }'
  elif [ -n "$_serial" ]; then
    echo "$_serial"
  else
    echo "$DEVICE_SERIAL"
  fi
}

# EVERY target gets `adb reverse` and talks to 127.0.0.1 — emulators included.
#
# The obvious thing is to let an emulator use its special gateway 10.0.2.2, which
# is how it reaches the Mac without any forwarding, and that is what this script
# used to do.  It does not work for the relay.  The emulator's user-mode NAT
# completes the TCP connection to ws://10.0.2.2:4002 — `lsof` shows it
# ESTABLISHED — and then the libp2p upgrade stalls: no multistream negotiation,
# no reservation, just silence until the dial times out and surfaces as
# `Cannot read property 'message' of undefined` (RN's WebSocket close carries no
# Error, so libp2p's handler reads `.message` off `undefined`).
#
# The same emulator, same app build, same relay, reserves in about two seconds
# over `adb reverse` + 127.0.0.1.  So the route is the variable, and 10.0.2.2 is
# simply not usable here.  Worth knowing because the failure is doubly deceptive:
# it looks like an app bug, and the app's own network screen reports "Working"
# throughout.
is_emulator() {
  case "$1" in
    emulator-*) return 0 ;;
  esac
  [ "$(adb -s "$1" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')" = "1" ]
}

host_for() {
  echo "127.0.0.1"
}

# Metro and the relay both live on the Mac; every target needs both forwarded.
# 8081 as well as $METRO_PORT: `pm clear` wipes the app's saved dev-server
# setting, and a freshly-cleared app looks for the RN default port.
setup_reverse() {
  _s="$1"
  adb -s "$_s" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
  adb -s "$_s" reverse tcp:8081 "tcp:$METRO_PORT" >/dev/null
  adb -s "$_s" reverse "tcp:$RELAY_WS_PORT" "tcp:$RELAY_WS_PORT" >/dev/null
  echo "    $_s reversed: metro $METRO_PORT (and 8081), relay $RELAY_WS_PORT"
}

send_link() {
  _s="$1"; _url="$2"
  # The URL is single-quoted for the DEVICE's shell — see the header note.
  adb -s "$_s" shell am start -a android.intent.action.VIEW \
    -d "'$_url'" "$APP_ID" >/dev/null 2>&1
  echo "    sent to $_s"
}

# ── relay peer id ──────────────────────────────────────────────────────────
# Written by scripts/relay.sh as the relay starts.  The peer id is derived from
# the identity key in DATA_DIR, so it is stable across restarts — but read it
# fresh rather than hard-coding, since a wiped DATA_DIR mints a new one.
relay_peer_id() {
  _log="$DATA_DIR/relay.log"
  [ -f "$_log" ] || return 1
  grep -oE '12D3Koo[A-Za-z0-9]+' "$_log" 2>/dev/null | head -1
}

cmd_relay() {
  peer=$(relay_peer_id || true)
  if [ -z "${peer:-}" ]; then
    echo "No relay peer id found in $DATA_DIR/relay.log." >&2
    echo "Start the relay first:  yarn relay" >&2
    exit 1
  fi
  echo "==> relay $peer"
  for s in $(targets_from_args "$@"); do
    setup_reverse "$s"
    host=$(host_for "$s")
    addr="/ip4/$host/tcp/$RELAY_WS_PORT/ws/p2p/$peer"
    enc=$(printf '%s' "$addr" | sed 's|/|%2F|g')
    send_link "$s" "chat://relay?addr=$enc&name=Local%20dev%20relay"
  done
  echo
  echo "Accept the offer on each device; My network should then read"
  echo "\"Working — people can reach you through this.\""
}

cmd_reverse() {
  for s in $(targets_from_args "$@"); do setup_reverse "$s"; done
}

cmd_url() {
  url="$1"; shift
  echo "==> $url"
  for s in $(targets_from_args "$@"); do send_link "$s" "$url"; done
}

case "${1:-}" in
  ''|-h|--help) usage 0 ;;
  devices)      adb devices ;;
  relay)        shift; cmd_relay "$@" ;;
  reverse)      shift; cmd_reverse "$@" ;;
  *)            cmd_url "$@" ;;
esac
