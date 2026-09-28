# ser/chat — Sereus stack usage review

Independent review requested to check whether chat uses the Sereus stack in the
prescribed way, follows proper patterns, and whether any sloppy app-side code
could account for the problems being chased in another context. **No code was
changed.** Criticisms are limited to things likely to produce *functional*
errors — style is out of scope for this pass.

Method: three parallel deep reads — (1) the prescribed patterns, from the RN
reference app `sereus/packages/reference-app-rn` and `sereus/docs/reference-app-rn.md`;
(2) chat's actual integration under `apps/mobile`; (3) the optimystic/quereus +
Hermes runtime constraints. Then the top-impact app-side findings were verified
by hand against source (marked ✓verified below). The diagnostic history in
`design/specs/mobile/STATUS.md` was also read in full.

---

## Bottom line

**Chat follows the prescribed stack usage well in the load-bearing places.**
The polyfill set and import order are correct and complete, the Babel
`wrapAsyncGenerator` floor (`@babel/runtime`/`@babel/helpers ^7.29.2`) is pinned,
the class-static-block plugin is present, the owner-genesis sequence matches the
reference (`getIdentityOwnerKey → ensureOwnerKey → initializeSeedBootstrap`),
strands are created with the prescribed single `foundStrand` call, and relays are
supplied via the config field rather than `reserveRelays()` — all correct.

**The deep upstream diagnosis in STATUS.md is sound and is not contradicted here.**
optimystic#23 ("two relay-only peers each see a cohort of one because neither
one's FRET ring ever gains the other") is well-evidenced and is genuinely a
stack/architecture seam, not an app bug.

**But there are real app-side functional bugs, and at least one of them produces
the exact user-visible symptom the upstream hunt is about** (a strand that is
never launched / a join that waits out its first-sync budget). These should be
fixed regardless, because each one is a *confound* that can masquerade as, or
compound, the upstream failure. The STATUS log itself already shows this failure
mode: naive harnesses "manufactured upstream bugs" three times by omitting an
app-side step. The items below are the same hazard living in the app.

Priorities, in order: **A3 (lost subscription on rebuild)** first — it interacts
directly with the relay-change moment, which is exactly when a phone first
becomes reachable — then **A2 (spinner-forever swallows boot failure)**, then the
rest.

---

## A. App-side functional bugs (ranked)

### A1. Strand-list preview shows the OLDEST message, and "recent" sort ranks by it ✓verified
- `queryMessages` orders **ascending** and caps with the limit:
  `order by M.Timestamp asc, M.Id asc limit ?` — [chat-operations.ts:140-141](src/data/chat-operations.ts#L140-L141).
- `listStrands` asks for one row and takes the last of the array:
  `const msgs = await queryMessages(strand, 1); const last = msgs[msgs.length - 1];`
  — [sereus.ts:163-164](src/data/adapters/sereus.ts#L163-L164).
- With `limit 1` on an ascending sort this returns the **earliest** message. Every
  strand-list preview text and its `lastMessage.timestamp` are the oldest
  message's, so `StrandList`'s `recent` sort ranks by oldest-message time.
- Related: `listMessages` ignores its `before`/`limit` opts (passes nothing to
  `queryMessages`), so pagination is unimplemented and a >100-message strand
  renders only the oldest 100 (agent-reported; the `queryMessages` default
  `limit = 100` at [chat-operations.ts:131](src/data/chat-operations.ts#L131) confirms the cap).
- Fix shape: a `desc … limit 1` query for the preview (then reverse if needed),
  and honor `before`/`limit` in `listMessages`.
- Impact: always wrong; cosmetic-to-confusing, not a hang. Low risk, easy fix.

### A2. Boot failure or a late start presents as a permanent "Looking for your strands…" spinner ✓verified
- `strandsSettling()` returns `!hasSweptForStrands()` — [sereus.ts:144](src/data/adapters/sereus.ts#L144).
- `sweptForStrands` is set `true` only at the **end** of `watchDiscoveredStrands`
  — [chat-strand.ts:285](src/data/chat-strand.ts#L285) — which first does
  `await cadreService.ensureStarted()` — [chat-strand.ts:267](src/data/chat-strand.ts#L267).
- Its sole caller is the boot effect [App.tsx:44](App.tsx#L44), whose catch only
  warns. If `ensureStarted()` throws (missing native module, control-DB open
  failure, the native `react-native-quick-crypto` import failing — see B1), the
  flag is never set, `StrandList` shows the spinner branch forever, and the 3 s
  `load()` poll only ever fires `void ensureCadreUp()` — it never re-runs
  `watchDiscoveredStrands`, so even a *successful* late start never flips it.
- This is a swallowed-error-looks-like-a-hang defect: a boot failure is
  indistinguishable from "still loading". Given how much of the debugging effort
  has been spent deciding whether a hang is the stack or the app, this one
  actively hides the answer.
- Fix shape: set `sweptForStrands` in a `finally`/on terminal error too, or track
  an explicit error state, and make the spinner branch distinguish "failed" from
  "settling".

### A3. `strand:discovered` subscription is lost on every node rebuild and never re-added ✓verified — highest priority
- The only subscription is inside `watchDiscoveredStrands`
  ([chat-strand.ts:273](src/data/chat-strand.ts#L273)), called once at boot.
- `applyRelays` ([CadreService.ts:584-585](src/cadre/CadreService.ts#L584-L585))
  and `setNoiseCryptoMode` ([CadreService.ts:532-533](src/cadre/CadreService.ts#L532-L533))
  both `await this.stop()` (which nulls the node,
  [CadreService.ts:750](src/cadre/CadreService.ts#L750)) then build a **new**
  `CadreNode`. Unlike the `self:peer:update` listener — which `watchReachability`
  correctly re-establishes inside every `doStart` — nothing re-subscribes
  `strand:discovered` on the new node, and nothing re-runs `watchDiscoveredStrands`.
- Why this matters for the convergence hunt: **a relay change is exactly the
  moment a phone first becomes reachable**, and it rebuilds the node. The
  formation responder writes a discovered strand row but does not launch it
  (`chat-strand.ts` comments at [353](src/data/chat-strand.ts#L353) spell this
  out); after a rebuild that row's `strand:discovered` fires into no listener and
  the strand is never attached. The host then silently holds a strand it never
  runs, and the joiner waits out `StrandAwaitingFirstSyncError`. That is the same
  symptom as optimystic#23, arriving by a different, purely app-side route.
- Fix shape: re-run the subscribe-then-drain (`watchDiscoveredStrands`) as part
  of `doStart` (next to `watchReachability`), so it survives rebuilds; keep it
  idempotent (it already guards with the in-flight `attaching` set +
  `getStrands().has`).

### A4. Write/invite paths don't await node start (use-before-ready) — agent-reported
- Boot is backgrounded and un-awaited (`App.tsx` boot IIFE; `listStrands` fires
  `void ensureCadreUp()` at [sereus.ts:150](src/data/adapters/sereus.ts#L150)).
- But `createInvitation`, `acceptInvitation`, `inspectInvitation` read
  `cadreService.cadreNode` directly and throw "Cadre is not running." if it's null
  ([sereus.ts:312](src/data/adapters/sereus.ts#L312) and siblings); `send`/`react`/
  `strandFor` read `getStrands()` and throw "not attached". None call
  `ensureStarted()` first, whereas the `CadreService` methods
  (`createAuthorityKey`, `applySeedFromCode`, …) do.
- Impact: a user who reaches InvitationGenerator or a chat before the background
  boot resolves gets a hard error instead of a wait. Inconsistent and racy.
- Fix shape: `await ensureStarted()` (or `ensureCadreUp()`) at the top of the
  adapter write/invite paths, matching the `CadreService` methods.

### A5. `withTimeout` masks hangs and can leak founded strands — agent-reported
- `withTimeout` rejects but leaves the underlying promise running by design
  ("we can't cancel it", `async.ts`). Owner genesis is boxed at 30 s
  ([CadreService.ts:477](src/cadre/CadreService.ts#L477)); `publishFormationInvite`
  at 15 s ([sereus.ts:355-362](src/data/adapters/sereus.ts#L355-L362)).
- In `createInvitation` the strand is founded and self-registered **before** the
  time-boxed `publishFormationInvite`; if that write times out, the call rejects
  but the founded/published strand remains, and the next attempt founds a **new**
  UUID strand — repeated failures accrete orphan strands in the control DB.
- Impact: converts an indefinite control-DB block into a generic failure (hiding
  the real cause — the opposite of what the debugging effort needs), and leaks
  strands on the invite retry path.
- Fix shape: on invite failure, either reuse the already-founded strand id on
  retry or unpublish it; and prefer surfacing the timeout cause over a generic
  message in dev.

### A6. Un-awaited relay apply can overlap node rebuilds — agent-reported
- `SereusAdapter.setPrefs` fires `void cadreService.applyRelays(next.relayAddrs)`
  un-awaited; `applyRelays` does `stop(); _startPromise = null; ensureStarted()`.
  Two quick relay edits can interleave two stop/start cycles (stop closes all
  LevelDB handles) with no mutex beyond `_startPromise`, risking a rebuild racing
  a half-torn-down node / closed DB handles.
- Fix shape: serialize rebuilds (a rebuild queue/mutex), or await the apply.

---

## B. Divergences from the prescribed reference app (not necessarily bugs, but worth knowing)

### B1. Chat wires **native** Noise crypto; the reference app deliberately does not
- Reference: "native Noise crypto (`noiseCrypto`) is NOT wired — all handshakes
  run pure-JS on Hermes" (`reference-app-rn.md:123`).
- Chat: `noiseCrypto: buildNoiseCrypto(this._noiseCryptoMode)` default `symmetric`
  ([CadreService.ts:416](src/cadre/CadreService.ts#L416)), backed by
  `react-native-quick-crypto` + `@craftzdog/react-native-buffer`, imported at
  **module scope** in `noise-crypto.ts` — so a missing or mismatched native
  binding fails the entire `CadreService` import (which then surfaces as A2's
  infinite spinner, not as a clear error).
- This is chat's own optimization, not a prescribed pattern, and it is unvalidated
  against the reference's known-good pure-JS path. It adds a native surface and a
  new failure mode. Recommend: confirm the native path is actually exercised and
  correct on device, and consider a pure-JS fallback default until it is — or at
  minimum make the module-scope import failure surface distinctly. If any
  connection/handshake instability is seen, A/B this against `noiseCrypto` unset.

### B2. Chat lacks the reference app's persistent stores
- The reference opens, before constructing the node,
  `PersistentTrustedOwnerStore`, `PersistentBootstrapPeerStore`, and
  `PersistentEnrolledMachineStore` (over secure-store / app-private LevelDB)
  — `cadre-phone.ts:188-201`. These back cold-start seed trust, dial hints, and
  the repair yardstick across relaunches.
- Chat opens a single control DB + `loadOrCreateRNPeerKey` and relies on
  `pinnedKeyTrustPolicy` on paste. It does not open the bootstrap-peer or
  enrolled-machine stores. (Chat is bare RN 0.82 with no Expo secure-store, so the
  reference's exact classes don't port, but the *capability* is absent.)
- Bearing on STATUS: chat already compensates for one gap with its own
  `rememberJoinedStrand` / `reattachRememberedStrands` (a cross-party joiner's
  `MemberPrivateKey` lives only in app storage). But the **bootstrap-peer store**
  is the persisted dial-hint surface, and its absence is plausibly related to the
  predicted fix shape in STATUS ("a phone must re-derive or persist its partner's
  strand addresses on re-attach, the way formation supplies them once"). Worth a
  direct look: does chat persist and re-supply partner/strand circuit addresses on
  re-attach, or only the member key? If only the key, a re-attached joiner has no
  route back into the ring — which is precisely optimystic#23's shape.

### B3. Reference is Expo + RN 0.79.6; chat is bare RN 0.82.1
- Not a defect, but it means the reference's Metro `browser`-field `resolveRequest`
  workaround (needed under Expo's `unstable_enablePackageExports`) and its portal
  wiring do not map one-to-one. Chat runs npm-mode Metro. Just flag when comparing
  metro configs: differences there are expected, not bugs.

---

## C. Dependency / version hazards

### C1. Version world — chat is on the current published stack (good), with pinning gaps
- Chat declares `@serfab/cadre-core ^1.5.0`, `@optimystic/* ^1.6.0`,
  `@quereus/quereus ^4.20.0`, `@babel/runtime`/`@babel/helpers ^7.29.2` — matching
  the reference app's declared (published) versions. The Babel floor and the
  class-static-block plugin are both present. These are the hazards that
  previously bit; they are cleared.
- Note (context only): the sibling `sereus/` monorepo *checkout* is much older
  (`@optimystic 0.14.1`, `@quereus 4.18.0`). That is the clone's node_modules, not
  chat's — chat in npm mode pulls the published 1.6.0/4.20.0. Don't be misled by
  the clone's versions when reasoning about what chat actually runs.

### C2. Partial libp2p pinning + a phantom (unpinned) direct import — agent-reported
- `@libp2p/circuit-relay-v2` is **imported** ([CadreService.ts:37](src/cadre/CadreService.ts#L37))
  but is neither in `dependencies` nor `resolutions` — it resolves transitively
  (currently ~4.2.4), and the code already casts around a "nominal brand skew"
  against db-p2p's transport type ([CadreService.ts:370-378](src/cadre/CadreService.ts#L370-L378)).
  An unpinned transitive whose transport identity is being papered over is exactly
  what a stack bump can silently break (two copies → `transportSymbol` mismatch →
  transport silently not registered).
- `libp2p`/`@libp2p/interface`/`@libp2p/peer-id` are hard-pinned, but
  `@libp2p/websockets` (direct `^10.1.3`) floats — partial pinning across one
  libp2p family invites duplicate/incompatible copies.
- `@craftzdog/react-native-buffer` (used in noise-crypto.ts), `readable-stream`
  and `buffer` (both `require.resolve`d in metro.config.js) are used but
  **undeclared** in this package.json — they resolve transitively today and can
  vanish on a dependency change.
- Fix shape: add `@libp2p/circuit-relay-v2` as a direct dep + resolution pinned to
  the same libp2p family versions the rest of the stack uses; pin
  `@libp2p/websockets`; declare the buffer/stream packages directly.

### C3. Runtime constraints already satisfied (do not re-investigate)
From the cross-cutting read, all of these are correctly handled in chat and are
NOT suspects:
- Polyfill set is complete and correctly ordered; `react-native-get-random-values`
  is first; `DOMException` precedes the abort helpers; `AbortSignal.timeout`/`any`
  and `WebSocket.bufferedAmount` are all present (these three are the "can the
  phone dial at all" globals).
- `@optimystic/db-p2p` is consumed via its RN entrypoint (npm-mode metro shims
  `net`/`tls` to empty and provides `os`/`stream`/`buffer`/`crypto`), so
  `@libp2p/tcp` is not bundled.
- The Babel async-generator-cleanup hang (the classic silent founding stall) is
  precluded by the `^7.29.2` pin.

---

## D. Confirmed-correct / not the problem (so it isn't re-chased)

- **Polyfill ordering** — verified sound; no defect (Section C3).
- **Boot ordering** — `App.tsx` applies saved relays *before* the node is built,
  so the first `ensureStarted` already has the relay set; no wasteful rebuild at
  boot, and the second `applySavedRelays` inside `ensureCadreUp` is an idempotent
  no-op.
- **Owner genesis** — matches the reference exactly (single-key model:
  `getIdentityOwnerKey → ensureOwnerKey → initializeSeedBootstrap`).
- **Strand creation** — uses the prescribed single `foundStrand` call (idempotent,
  avoids `UNIQUE constraint failed: Strand.Id`); closed strands use
  `generateStrandMemberKey` + role assignment as prescribed.
- **`self:peer:update` / reachability** — correctly re-subscribed on every
  `doStart` and torn down in `stop()` (this is the pattern A3 is missing).
- **`attachDiscoveredStrand` idempotency** and subscribe-then-drain ordering are
  correctly reasoned.
- **The FRET-ring / cohort-of-one convergence failure (optimystic#23)** is a
  genuine upstream seam per STATUS.md's device traces; nothing in the app code
  refutes that. The app-side items above are separate confounds that share its
  symptom, not a replacement explanation for it.

---

## E. Suggested sequence for the other context

1. Fix **A3** (re-run `watchDiscoveredStrands` inside `doStart`) — removes the most
   likely app-side confound with the two-party symptom, and it's small.
2. Fix **A2** (don't let a boot failure look like a spinner) — so the next
   reproduction *tells you* whether it hung in the stack or failed in the app.
3. Answer the **B2** question: does chat persist/re-supply partner strand circuit
   addresses on re-attach, or only the member key? This is the app-side half of
   the optimystic#23 fix shape STATUS already predicted.
4. Then C2 pinning (removes a class of "worked yesterday, broke on install"),
   A4/A5/A6, and A1 at leisure.

Doing 1–2 first is the cheapest way to stop app-side confounds from being read as
upstream failures — the exact trap STATUS.md documents falling into three times.
