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

// globalThis.process.env.DEBUG = 'sereus:cadre:relay-reservation';
// globalThis.process.env.DEBUG = 'sereus:cadre:*,optimystic:*';
// Tracing why a device's own writes stop crossing once the strand is attached:
// this is the transaction/cluster path, which is where an outbound commit would
// either fail to find a cluster or quietly succeed locally.
// NARROW ON PURPOSE. `optimystic:*` emits thousands of lines a minute, and every
// console call crosses the RN bridge — enough to starve the JS loop and make
// first sync time out, so the tracing changes the outcome it is meant to observe.
// Three clean joins failed in a row with it on; they succeed with it off.
// globalThis.process.env.DEBUG = 'optimystic:db-core:network-transactor';
// globalThis.process.env.DEBUG = 'optimystic:db-p2p:protocol-client,optimystic:db-p2p:sync-service,optimystic:fret*,sereus:cadre:relay*';
// Narrowed on purpose: cohort/coordinator resolution only. `optimystic:*` floods the
// RN bridge badly enough to change the outcome it is meant to observe.
// TRAILING `*` MATTERS: the logger appends the peer id, so the real namespace is
// `optimystic:db-p2p:libp2p-key-network:12D3Koo…`, and `debug` matches exactly
// unless told otherwise. Without the star this filter silently logs nothing.
// globalThis.process.env.DEBUG = 'optimystic:db-p2p:coordinator-repo*,optimystic:db-p2p:protocol-client*,optimystic:db-p2p:sync-service*';
// FULL FIRE HOSE, deliberately. This floods the RN bridge hard enough to change
// timing — three clean JOINS failed in a row with it on — so it must not be used
// while measuring anything join- or first-sync-related. It is safe here because
// the strand is already attached and the thing under investigation is a READ.
// globalThis.process.env.DEBUG = 'optimystic:*,sereus:cadre:*';
// Wire-level only: does either device ever CONTACT the other at strand level?
// globalThis.process.env.DEBUG = 'optimystic:db-p2p:protocol-client*,optimystic:db-p2p:sync-service*,optimystic:db-p2p:coordinator-repo*';
// THE COHORT MEMBERSHIP VERDICT, and nothing else. One line per cohort assembly:
//   cohort:membership key=… band=N serves=N unknown=N foreign=N cohort=N selfInCohort=…
// This is the decisive measurement for gotchoices/Optimystic#23. `membershipOf`
// answers 'unknown' for any peer whose peerStore protocol list is empty, and the
// cohort builder NEVER admits an 'unknown'; upstream's own comment says such a
// peer "flips to 'serves' once identify completes". So if a phone that can see
// its partner reports `band=2 serves=1 unknown=1 cohort=1`, identify is not
// completing on this runtime and that — not findCluster itself — is why every
// read takes `cluster-fetch:solo-self-skip`.
// Narrow enough to be safe: one line per assembly, not the per-dial fire hose
// that changed outcomes above, and read-path only on an already-attached strand.
// THE #23 MEASUREMENT, 2026-09-26. Left commented out, but do not delete — this
// is the namespace that found the cause, and it is cheap (two lines per boot).
//
// On BOTH devices, the only fret activity in a whole session is:
//   fret:error announce to <THE RELAY>: foreign-protocol   (x2)
//
// That is the whole of gotchoices/Optimystic#23. A relay-only phone's only
// connected peer is the relay; `announce` is how a node enters the FRET ring;
// the relay rejects it as `foreign-protocol` because a relay does not speak the
// party's fret protocol. So the ring never gains a member, `fret.assembleCohort`
// returns a band of one, findCluster yields a cohort of one, and every read takes
// `cluster-fetch:solo-self-skip`. Nothing is misclassified — see the
// libp2p-key-network line above, which reports unknown=0 foreign=0.
// globalThis.process.env.DEBUG = 'optimystic:fret*';
