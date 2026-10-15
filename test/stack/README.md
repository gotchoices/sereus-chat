# Stack check

Validates the **sereus stack** against a new release, in Node — no app, no device,
no emulator. Run it whenever `@serfab/cadre-core` or `@optimystic/*` moves.

```sh
cd test/stack && yarn install    # first run only
yarn stack:check                 # from the repo root
```

Roughly two seconds. Exit code 0 = converged, 1 = did not.

## Why this exists

Founding a strand on a device does not converge for us — see
`design/specs/mobile/STATUS.md` and gotchoices/Optimystic#8. The upstream
integration suite is green because it injects `MemoryRawStorage`, so it never
exercises the React Native storage adapter in composition with the stack above it.

This harness closes exactly that gap, by putting the adapter the phone runs over a
real on-disk LevelDB:

```
CadreNode → … → LevelDBRawStorage        (@optimystic/db-p2p-storage-rn)
                   └─ LevelDBLike over classic-level   (instead of rn-leveldb)
```

That substitution is legitimate rather than a hack: the storage classes depend only
on the `LevelDBLike` interface and never import `rn-leveldb` (which is why it is a
PEER dependency), and the package's own tests use the same approach.

## What a result means

| outcome | reading |
| --- | --- |
| **PASS** | Storage semantics, the adapter, the schema and our `foundStrand` usage are all fine. The gap is the RN runtime itself — Hermes, the `rn-leveldb` native module, or the device. |
| **FAIL** | The defect reproduces in Node, under a debugger, with no device — the artifact upstream has been missing. Re-run with `DEBUG=optimystic:*,sereus:cadre:*`. |

As of cadre-core 0.13.0 + `@optimystic/*` 1.0.0-beta.3 it **passes in ~0.2 s**, with
or without a listen address (`LISTEN_ADDRS=none` matches the phone, which cannot
listen). The same call on a real device had not converged after 44 minutes.

## What has been ruled out with this harness

- **Per-operation storage latency is NOT the variable.** `STORAGE_OP_DELAY_MS` sleeps
  before every raw-storage op (the same idea as the integration harness's own
  `storageOpDelayMs`). Founding scales cleanly and linearly with it — 0.3 s at 0 ms,
  1.8 s at 5 ms, 3.1 s at 10 ms, 8.1 s at 50 ms, no cliff. Reaching the device's
  600 s would need roughly **3,700 ms per operation**, which no bridge crossing
  approaches. So slowness on device and non-convergence on device are separate
  problems, and upstream's `storageOpDelayMs` will not reproduce ours either.
- **Scheduling is UNTESTED, not disproven.** `rn-leveldb` is a synchronous native
  module behind `async` methods that never `await`, so its operations settle on the
  microtask queue and never yield to timers or sockets; `classic-level` does real
  I/O and yields on every op. To test whether that matters we tried an in-memory
  driver with and without a yield — but both arms failed identically with
  `sync for collection optimystic/schema exhausted 10 retries`, which is a bug in
  the hand-rolled driver rather than a finding. Writing a faithful LevelDB
  substitute is its own project; the attempt was removed rather than left to
  mislead. **The scheduling hypothesis remains open.**

## Knobs

- `STRAND_TIMEOUT_MS` — how long to wait before calling it a failure (default 600000)
- `LISTEN_ADDRS=none` — listen on nothing, as React Native does
- `DEBUG=optimystic:*,sereus:cadre:*` — block-level trace

## Scope

Deliberately one node, one table, no peers, no relay — the smallest thing that
should be trivially true. It is a *validator*, not a test suite: it answers "is the
stack usable at all from a cold start", and nothing else.

## The other scripts, and what now covers them

This folder is for reproducing **bare stack** behaviour — `CadreNode` with no chat model,
often in shapes a test suite cannot take (separate processes, a frozen peer, a slow link)
— as evidence for upstream issues. Chat-level behaviour is tested elsewhere now:
`packages/core` (contract and diagnostics tests, in process) and `apps/cli/test`
(serchat scenarios, real processes). Scripts are kept until the upstream question they
support is settled, then retired.

| Script | Question | Also covered by |
|---|---|---|
| `found-strand.mjs` | Does founding one strand converge? | Same code as the core's `runFoundStrandCheck` (core test, phone `diagnose found`) |
| `handshake-cost.mjs` | Primitive crypto costs | Same code as `runCryptoCost` (core test, phone `diagnose crypto`) |
| `two-party-formation.mjs` | Two parties form a strand through a relay (`--host`/`--join` for separate processes) | Core `runTwoPartyCheck` (in process); serchat scenario "invite, join and talk" (chat level) |
| `restart-reconverge.mjs` | Do two relay-only parties converge after a restart? | serchat scenario "invite, join and talk … the inviter restarts" (chat level) |
| `offline-inviter-join.mjs` | A join while the inviter is offline | serchat scenario "a join while the inviter is offline" (chat level) |
| `formation-cost.mjs` | Where founding and joining spend their time, step by step (wall vs CPU; `RELAY_ADDR`, `FOUND_ONLY`, `MESSAGES`, `TRACE_SQL`); the repro in Optimystic#39 | — |
| `message-latency.mjs` | Where one message's time goes | `test/devices/devtime.mjs` (two devices or serchat) |
| `owner-recovery.mjs` | Recovery with an offline backup owner key | — (serchat `cadre` commands, Phase 7b) |
| `slow-peer.mjs`, `contention-repro.sh`, `small-cohort-repro.sh` | Stalled peers, contention, two-machine cohorts | — |
| `relay-reservation-cap.mjs`, `probe-services.mjs` | Relay limits; what a node exposes | — |
| `cpu-cost.mjs`, `loop-hog.mjs`, `rn-timers.mjs`, `ws-latency.mjs`, `ws-trace.mjs` | Modules that model a device in Node (slow crypto, a starved loop, RN timers, link latency, socket tracing) | — (used by the scripts above) |
