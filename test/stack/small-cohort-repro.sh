#!/usr/bin/env sh
# small-cohort-repro.sh — two failures a 2-machine cohort hits, device-free.
#
# Context: a chat app's deployment curve is 1 machine, then 2, and only later 3+.
# optimystic's quorum and repair rules are built for 4+ (its own startup advisory
# says "3 machines is the MINIMUM that can repair at all, not a safe size … 4
# machines is the first size with any margin"). Below that it does not degrade
# gracefully; it declines.
#
# Both cases below use two parties that can reach each other ONLY through a
# circuit relay — the shape of two phones — and both are scripted with a control.
#
#   A. WRITE IN THE WINDOW AFTER A PARTNER LEAVES — TRANSIENT, not permanent.
#      One party detaches (a phone asleep). For a short window the remaining party
#      cannot write to its own strand: "Failed to get super-majority: 1/2 approvals
#      (needed 2, 0 rejections)" — the quorum is counted against a cohort that has
#      not shrunk yet. Measured: with `DETACH_SETTLE_MS=2000` the write fails; with
#      20000 it succeeds (2/2 runs), so the cohort does re-declare and this heals
#      itself. Reported for completeness, not as the headline — the window matters
#      for a chat app only in that a send during it fails outright rather than
#      retrying.
#
#   B. RE-ATTACH UNDER A WAN ROUND TRIP — the real finding, latency-dependent.
#      The same detach/re-attach at LAN latency re-attaches in ~5 s. At a 1800 ms
#      round trip it fails after 120 s with StrandAwaitingFirstSyncError, "no
#      member of this strand has been reachable since this machine joined". That
#      is the error two real phones give over a public relay.
#      Suspected cause: `LATEST_QUERY_TIMEOUT_MS` in db-p2p's coordinator-repo is
#      a hardcoded 1000 ms with no configuration path, and its own comment calls
#      it "a LAN-shaped budget … If a WAN deployment shows steady
#      `cluster-fetch:peers-silent` against healthy peers, raise this".
#
# Latency is raised AFTER formation on purpose: injected from the start, 700 ms
# blows the 5 s formation dial budget and the run dies before reaching the part
# under test.
#
#   sh small-cohort-repro.sh [relay-multiaddr]
#
# Defaults to the sereus.org community relay.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
RELAY=${1:-/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E7UH4rkCqiFE69n7FNqrKo1Xx3yDUU8JvwtaH39bD}
OUT=${OUT_DIR:-$(mktemp -d)}
mkdir -p "$OUT"

cleanup() { pkill -f "two-party-formation.mjs" 2>/dev/null || true; }
trap cleanup EXIT
cleanup; sleep 1

run_case() {
  delay=$1; label=$2; logf="$OUT/$3"
  echo "── $label (one-way delay ${delay}ms) ─────────────────────────"
  WS_DELAY_ARMED=1 READ_DELAY_MS="$delay" RELAY_ADDR="$RELAY" IDLE_MS=2000 ROUNDS=1 \
    timeout 500 node "$HERE/two-party-formation.mjs" > "$logf" 2>&1 || true
  grep -aE "CANNOT WRITE|wrote while the partner|re-attached,|re-attach failed|READ under" "$logf" \
    | sed 's/^/    /' | cut -c1-160
  echo
}

echo "relay: $RELAY"
echo "logs:  $OUT"
echo
run_case 1   "CONTROL — LAN latency"  ctrl.log
run_case 900 "WAN round trip ~1800ms" wan.log

echo "Expected — case B is the reliable one:"
echo "  RE-ATTACH succeeds in the control (~5-10s) and FAILS in the WAN run (120s timeout)."
echo "Case A (the write) is a transient post-departure window; raise DETACH_SETTLE_MS"
echo "to 20000 and it succeeds instead. Both behaviours are expected output."
