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
