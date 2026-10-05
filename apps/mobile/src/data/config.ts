/**
 * Single-point data backend switch.
 *
 * `USE_SEREUS = false` → MockAdapter, JSON fixtures.  Default for development
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
 * OFF for now. Two-person strands do not need it: both phones store every block, so a
 * `Database.watch` already wakes when the other phone's commit is applied here. It
 * matters once a strand outgrows its replication breadth. Its cost is a proof-of-work
 * registration per watched table on every node build and hibernation wake, 0.3–17 s
 * on Node and slower on a phone's JS thread (sereus docs/strands.md "Known cost").
 * Every machine serving a strand must enable it for push wakes to work.
 */
export const STRAND_REACTIVITY = false;
