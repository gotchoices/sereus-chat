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

# An emulator reaches the Mac at the special gateway 10.0.2.2.  A USB device has
# no route to the Mac at all, so it talks to 127.0.0.1 and `adb reverse` carries
# the port back down the cable.
is_emulator() {
  case "$1" in
    emulator-*) return 0 ;;
  esac
  [ "$(adb -s "$1" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')" = "1" ]
}

host_for() {
  if is_emulator "$1"; then echo "10.0.2.2"; else echo "127.0.0.1"; fi
}

# Metro and the relay both live on the Mac; a USB device needs both forwarded.
setup_reverse() {
  _s="$1"
  if is_emulator "$_s"; then
    echo "    $_s is an emulator — no adb reverse needed"
    return 0
  fi
  adb -s "$_s" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
  adb -s "$_s" reverse "tcp:$RELAY_WS_PORT" "tcp:$RELAY_WS_PORT" >/dev/null
  echo "    $_s reversed: metro $METRO_PORT, relay $RELAY_WS_PORT"
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
