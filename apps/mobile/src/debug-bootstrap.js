/**
 * Debug logging for the sereus / optimystic / fret stack.
 *
 * MUST be the first import in index.js: the `debug` package (and `weald`, which
 * @libp2p/logger uses) reads its configuration ONCE, when the module first
 * initializes.  Setting this afterwards has no effect.
 *
 * WHY process.env AND NOT localStorage.  Both libraries prefer
 * `localStorage.getItem('debug')`, which React Native does not have, and both
 * fall back to `process.env.DEBUG` — which RN does not have either.  So we
 * fabricate just enough of `process.env` for that fallback to find something.
 *
 * TO TURN IT ON: uncomment a line below (or add your own namespaces), then
 * restart the app — this is a bundle-time switch, not a runtime one.
 *
 *   sereus:cadre:*   cadre-node bring-up, control DB, relay reservation,
 *                    strand formation — start here for a hang during startup
 *                    or an invitation that never mints
 *   optimystic:*     block storage, cluster/cohort coordination, transactions
 *                    — where a control-DB write actually blocks
 *   libp2p:*         transports, upgrader, circuit relay.  See the caveat below
 *
 * Output goes to console.debug/log, so it lands in
 * `adb logcat -s ReactNativeJS:V` like any other app log.
 *
 * ⚠️ libp2p:* CAVEAT.  @libp2p/logger routes through `weald`, whose node build
 * imports `node:tty`/`node:util`.  metro.config.js sets
 * `unstable_enablePackageExports: true`, under which the package `browser` field
 * rewrite is not reliably applied to a package's own internal relative imports
 * (the same reason that config hand-maps @libp2p/crypto).  `weald` is not in
 * that map, so enabling `libp2p:*` may fail to resolve rather than log.
 * `sereus:cadre:*` and `optimystic:*` use plain `debug` and are unaffected.
 */

if (!globalThis.process) globalThis.process = {};
if (!globalThis.process.env) globalThis.process.env = {};

// globalThis.process.env.DEBUG = 'sereus:cadre:*';
// globalThis.process.env.DEBUG = 'sereus:cadre:*,optimystic:*';
