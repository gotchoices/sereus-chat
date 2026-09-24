#!/usr/bin/env sh
# contention-repro.sh — two parties writing the same collection at once, one of
# them slow. Reproduces, with no device involved, the write failures a phone hits:
#
#   sync for collection default/app/Message exhausted 10 retries:
#     pending conflict: block(s) held by unresolved rival action(s) <id>
#   sync for collection default/app/Message exhausted 10 retries:
#     stale revision: block X at rev N, requested rev N, last seen block X at rev N
#
# The second one is worth reading twice: it calls a revision stale while printing
# the same number three times.
#
# WHY THE SLOW PARTY MATTERS. Sixty concurrent rounds with both parties at full
# speed never collide, and neither does 60 ms of injected link latency, a joiner
# stopped mid-commit, or one frozen with SIGSTOP and resumed. What does it is a
# writer that cannot keep up: LOOP_HOG_DUTY takes the event loop away from the
# joiner for most of every 50 ms window, which is the one thing Hermes does to a
# phone that Node does not do to itself.
#
# WHY TWO PROCESSES. In one process there is a single global WebSocket and a
# single event loop, so "slow" cannot be applied to one party alone.
#
# ON DEVICE the same failure did NOT clear: both machines reported one rival
# action id for as long as they were watched. Here the starved host recovers
# after a handful of failures. So this reproduces the FAILURE, not (yet) its
# permanence — see design/specs/mobile/STATUS.md.
#
#   sh contention-repro.sh [seconds]     # default 240
#
# Requires the dev relay (yarn relay) — the same one the app uses.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
RUN_S=${1:-240}
OUT=${OUT_DIR:-$(mktemp -d)}
mkdir -p "$OUT"
HOST_LOG="$OUT/contend-host.log"
JOIN_LOG="$OUT/contend-join.log"

cleanup() { pkill -f "two-party-formation.mjs" 2>/dev/null || true; }
trap cleanup EXIT

cleanup; sleep 2
echo "logs: $OUT"

# The host writes often, so the two parties are contending rather than taking turns.
TICK_MS=${TICK_MS:-1000} nohup node "$HERE/two-party-formation.mjs" --host > "$HOST_LOG" 2>&1 &
sleep 25

URL=$(grep -o "sereus://invite/[A-Za-z0-9_=-]*" "$HOST_LOG" | head -1)
[ -n "$URL" ] || { echo "no invitation — is the relay running? (yarn relay)"; tail -5 "$HOST_LOG"; exit 1; }

# CPU_SLOWDOWN is deliberately NOT used: it patches the crypto primitives the
# strand DDL's own verify() constraints run on, and the joiner then dies on
# `create table Strand.Member` before it can contend with anybody.
LOOP_HOG_DUTY=${LOOP_HOG_DUTY:-0.6} \
JOIN_WRITE_MS=${JOIN_WRITE_MS:-200} \
REACHABLE_MS=${REACHABLE_MS:-180000} \
  nohup node "$HERE/two-party-formation.mjs" --join "$URL" > "$JOIN_LOG" 2>&1 &

echo "running ${RUN_S}s…"
sleep "$RUN_S"

# LONGEST OUTAGE, in seconds — the number that matters. The open question about
# this bug was never whether a write can fail; it is whether the loser gets back
# in, and how long it is shut out for. On device the host made no progress for
# about eight minutes and the run then ended, so "permanent" was never actually
# established. Measuring the same quantity here makes that observation comparable
# rather than anecdotal. Baseline on optimystic 1.4.0: 455s across 21 consecutive
# failures, then recovery — i.e. the device's eight minutes was very likely this
# same outage rather than a terminal state.
outage=$(python3 "$HERE/longest-outage.py" "$HOST_LOG")

ok=$(grep -ac 'wrote "host tick' "$HOST_LOG" || true)
bad=$(grep -ac 'tick write failed' "$HOST_LOG" || true)
rival=$(grep -ac 'unresolved rival action' "$HOST_LOG" || true)
stale=$(grep -ac 'stale revision' "$HOST_LOG" || true)
jok=$(grep -ac 'JOINER: write .* ✓' "$JOIN_LOG" || true)

echo
echo "host writes:   $ok ok, $bad failed  (rival-action: $rival, stale-revision: $stale)"
echo "joiner writes: $jok ok"
echo "longest outage:  $outage"
echo
if [ "$bad" -gt 0 ]; then
  echo "REPRODUCED — the slower party is refused under contention."
  grep -ao "exhausted 10 retries.*" "$HOST_LOG" | head -3
  exit 2
fi
echo "not reproduced in ${RUN_S}s — try a longer run, or raise LOOP_HOG_DUTY."
