/**
 * Single-point data backend switch.
 *
 * `USE_SEREUS = false` → the core mock model (createMockModel), JSON fixtures.  Default for development
 * and screenshots; no native modules, no networking.
 *
 * `USE_SEREUS = true`  → SereusAdapter, talks to the live cadre stack:
 *   CadreNode (libp2p) → strand Quereus DB (optimystic plugin) → LevelDB-RN.
 *   Solo on first launch, replicates once the user adds peer nodes / partners.
 *   Requires the polyfills in index.js and the metro.config.js workspace
 *   resolution to the local sereus/optimystic/quereus/fret clones.
 *
 * Higher-level code (adapter.ts, screens) only checks USE_SEREUS.
 *
 * Future axis: USE_OPTIMYSTIC.  In the health app this distinguishes
 * Quereus-on-direct-LevelDB (local-only, no libp2p) from Quereus-on-optimystic
 * (distributed via CadreNode).  Chat does not yet have a Quereus-only path —
 * the sereus path is always optimystic-backed via CadreNode — so a second
 * switch is not needed today.  Add it the day a non-optimystic Quereus mode
 * becomes useful.
 */
export const USE_SEREUS = true;

/**
 * Sereus 1.12's strand change notifications (`CadreNodeConfig.strandReactivity`).
 *
 * OFF, measured. Two-person strands do not need it: both phones store every block, so a
 * `Database.watch` already wakes when the other phone's commit is applied here. It
 * matters once a strand outgrows its replication breadth. Every machine serving a strand
 * must enable it for push wakes to work.
 *
 * Measured on 1.14 (S7 and emulator, public relay, 2026-10-12; docs/STATUS.md, 2d).
 * Turning it on made every measure worse:
 *   - delivery 11–12 s instead of 5.5–6 s;
 *   - idle strand streams 220 a minute instead of 137;
 *   - a background wake 29 s instead of 17 s;
 *   - delivery right after the wake 33–37 s instead of 9–15 s.
 * Re-measure before turning it on.
 */
export const STRAND_REACTIVITY = false;

/**
 * WebRTC (2026-11-13, experiment): phones meet through the relay, then try a direct connection
 * (`@libp2p/webrtc`, ICE with the relays' own STUN servers) and keep the relay as the fallback.
 * What large writes cost through the public relay is why: 100–200 s for a 1 MB photo with a
 * phone in the cohort (docs/STATUS.md). `[conn]` log lines show which connections are direct.
 */
// OFF: with the transport alone nothing went direct; with `/webrtc` listening, a join fails outright
// wherever ICE cannot connect (no fallback to the relay in formation; 2026-11-14). See docs/STATUS.md.
export const WEBRTC = false;

/**
 * The core's `[perf]` timeline (when a message is written, first seen, fetched) in a release
 * build, as a development build always logs it. For measuring on phones; off for everyone else.
 */
export const PERF_LOG = false;
