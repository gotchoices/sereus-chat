# STATUS: moving to the app-family structure

Checklist for moving from today's single app (`apps/mobile`) to the structure in
[app-family.md](app-family.md). `apps/mobile` stays where it is throughout. Each
phase leaves the mobile app working and shippable to testers.

**Ready for `apps/web` (or `apps/mobile-ns`) after Phase 6.** At that point the
core holds the whole model, a Node test proves the Sereus implementation, and
`apps/mobile` binds only to core stores. Phase 7 (resources) can run alongside
the first web work.

## Where today's code goes

| Today (`apps/mobile/src/…`) | Goes to | Notes |
|---|---|---|
| `data/chat-sapp.ts` | `core/protocol` | Schema generated from `chat-sapp.qsql` into TS; sApp id and config. Member-key generation moves to `core/sereus`. |
| `data/inviteLink.ts` | `core/protocol` | Link and QR payload formats, hosts, scheme |
| `data/types.ts` | `core/model/*` | Split by namespace (done, Phase 4; the app file re-exports) |
| `data/errors.ts` | `core/model` | Becomes `ChatError` kinds |
| `data/adapter.ts` | `core/model` | `DataAdapter` becomes `ChatModel`; backend selection stays in the app |
| `data/adapters/sereus.ts` | `core/sereus/model.ts` | Done (Phase 5); AsyncStorage use became slots; `perf()` timing behind `ChatHost.dev` |
| `data/adapters/mock.ts` | `core/mock` | Fixtures through `FixtureSource` from root `mock/data` (done, Phase 4) |
| `data/chat-operations.ts` | `core/sereus/operations.ts` | Done (Phase 5) |
| `data/chat-strand.ts` | `core/sereus/strands.ts` | Done (Phase 5) |
| `data/strand-prefs.ts`, `strand-summary-cache.ts`, `outgoing-invitations.ts` | `core/sereus/local-state.ts` | Done (Phase 5), over slots |
| `data/data-format.ts` | Stays in the app | It scans the app's own storage before any model exists |
| `data/chat-sapp.ts` (create and join) | `core/sereus/sapp-strands.ts` | Done (Phase 5) |
| `screens/ChatInterface.tsx` drafts and read cursors | `core/model` `messages` | Done (Phase 5), slots `draft`, `readCursor` |
| `cadre/async.ts` | `apps/mobile/src/host/` | Host timeouts; the core has its own `withTimeout` |
| `theme/colorHash.ts` | `packages/resources/tokens` | A color palette: design tokens, not model (Phase 7) |
| `cadre/CadreService.ts` | `apps/mobile/src/host/` | Done (Phase 5): the kit's phone node behind `NodeHost`, adapted by `host/chat-host.ts` |
| `cadre/rn-durable-slot.ts` | `apps/mobile/src/host/` | The AsyncStorage `DurableSlot` behind the core's slots |
| `cadre-ui/useCadreManager.ts` | `core/stores` | Cadre-manager store; the RN components stay in the app |
| Screen polling (`StrandList`, `ChatInterface`, `InvitationGenerator`, `AppNavigator` reachability) | `core/stores` | Loader store and screen stores |
| `diagnostics/*` | `core/diagnostics` | Including the dev-bridge commands; the app only installs it. `two-party-check`'s node construction (`openOptimysticRNDb`, `new CadreNode`) becomes the app's `createExtraNode` |
| `i18n/locales/*` | `packages/resources/strings` | Plus keys for every error kind and status code |
| `theme/*` tokens | `packages/resources/tokens` | Data only; `apps/mobile/src/theme` maps them to RN styles |
| `data/config.ts` | Stays in the app | `USE_SEREUS` is backend selection; `STRAND_REACTIVITY` is node config |
| `data/attachmentDraft.ts`, `mock/VariantContext.tsx`, `ui/*`, `components/*`, `screens/*`, `navigation/*` | Stay in the app | Presentation and screen hand-offs |

## Phase 1 — Workspace root (done 2026-10-12)

- [x] Root `package.json`: Yarn workspaces `packages/*` and `test/stack` (not
      `apps/*`). `test/stack` is listed by name: `test/devices` has no
      `package.json`, and a `test/*` glob would make Yarn reject it. The root
      has its own `yarn.lock` and `.yarnrc.yml` (`nodeLinker: node-modules`),
      so Yarn does not treat it as part of the `ser/` project above it
- [x] `test/stack` joins the workspace: its lockfile, `packageManager` and
      `resolutions` moved to the root. Checked with a two-round
      `message-latency.mjs` run through the public relay
- [x] `scripts/use-stack.sh` (`yarn stack`) replaces `apps/mobile/use-stack.sh`.
      It writes **exact** stack versions into every consumer at once: the
      root's `resolutions`, each `apps/*` (dependencies and resolutions),
      `test/stack`, and `packages/*` peer ranges once they exist. `npm` and
      `local` (portal) modes as before. `apps/mobile` re-locked with no
      resolved version changing
- [x] Metro `blockList` for the root `node_modules` and `test/`. The root is a
      Metro watch folder (for `design/` and `mock/`) and now holds a second copy
      of the stack. A one-off dev bundle confirmed that no module comes from
      either, with one copy each of `@serfab/cadre-core` and
      `@libp2p/interface`, from the app. Phase 3 adds the pin for linked
      packages
- [x] `scripts/relay.sh` (`yarn relay` at the root, and still in
      `apps/mobile`) replaces `apps/mobile/scripts/relay.sh`. It no longer reads
      the app's `env-defaults.sh`, which held nothing relay-related
- [x] Landing site renamed `web/` → `site/`. `publish.sh` and `server.sh` locate
      themselves, and the remote destinations (`/var/www/sereus.org/chat`, apex
      `.well-known`) are fixed in the script, so deployed paths do not change.
      Path references updated:
      - `design/specs/mobile/navigation.md`;
      - story 42;
      - `site/README.md`;
      - the iOS entitlements and Android manifest comments;
      - `inviteLink.ts`.

      Dated history in `design/specs/mobile/STATUS.md` still says `web/`, as it
      was then
- [x] Recorded in `design/specs/project.md` (*Shared Resources*) and the root
      `README.md` (layout) that `packages/core` implements the domain contract
      and that targets bind to core stores. Not in the root `AGENTS.md`: it is
      Appeus's rules file, symlinked and gitignored

## Phase 2 — Adopt the cadre-rn kit in `apps/mobile`

Before anything moves, so that `CadreService` is replaced once, not refactored
into the core and then replaced. One change per step, each ending with the
**two-phone check** (pair, send both ways, restart each phone, converge, and
`devtime.mjs` timings against the previous step). A failure then names its
cause, and the open RN convergence work gains no confounds.

**2a. Adopt the kit's node.** (done 2026-10-12)
- [x] `CadreService` builds its node with `createPhoneNode`. Its public interface is
      unchanged, so no call site changed except relay handling (below).
      - The identity, trusted-owner anchor and joined strands are in the keychain,
        through `src/cadre/keychain.ts` over the new `react-native-keychain`
        dependency (a native module: the APK was rebuilt).
      - Trusted owners, bootstrap peers and enrolled machines are now persisted;
        before, they were in memory.
      - `configure` adds chat's strand filter, unsigned schemas and the reactivity
        switch. Hibernation stays off, as it was (cadre-core's default).
- [x] `noiseCrypto` passed with `buildNoiseCrypto` and the kit's default mode
      (`symmetric`), as before.
- [x] Everything else kept: the same relay, `strandReactivity` off, chat's own
      polyfills.
- [x] Persistence names: every name is in `src/data/persisted-names.ts`
      (AsyncStorage keys and the kit's `NODE_STORAGE_NAMES`: `chat-`,
      `chat-node-local`, `chat:node-local:`, `start-options`). The modules that
      used the keys import them from there. Pinned by
      `__tests__/persisted-names.test.ts` (passes).
- [x] Data wipe: `DATA_FORMAT` is `sereus-1.14-kit`. Both phones were wiped and
      re-paired.
- [x] Relays live in the kit's saved start.
      - `applyRelays` restarts with the current options and the new relays.
      - `getPrefs().relayAddrs` reads them from the node, and `setPrefs` no longer
        stores them.
      - The boot-time `applySavedRelays` step is gone.
      - The dev bridge gained `relays([addrs])`, which goes through the same
        `setPrefs` as the relay-offer screen.
- [x] Two-phone check (S7 ↔ emulator 5564, public relay):
      - Fresh install on both: the node started, owner genesis `enrolled`.
      - After a restart: the same party id and peer id, so the saved start and
        the keychain identity both hold.
      - Pairing: invite 4.0 s, join 32.4 s.
      - 3 rounds each way, no message missed: commit median 3.1 s / 3.6 s,
        delivery median 5.8 s / 6.7 s.
      - After restarting both: the strand reattached, relays kept, 2 rounds each
        way with none missed (commit 3.4 s / 5.7 s, delivery 4.9 s / 7.3 s).
      - These timings are not comparable with the 2026-10-09 runs, which had
        debug logging on and an extra strand on the emulator. 2b–2d compare
        against these.
- Install note: the emulator has too little free storage for the all-ABI
  debug APK (240 MB). Install an x86_64-only build there:
  `./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64`.

**2b. The kit's polyfills.** (done 2026-10-12)
- [x] `index.js` imports `@serfab/cadre-rn/polyfills` and `@serfab/cadre-rn/boot-check`.
      Chat's copies (`hermes`, `event`, `intl-pluralrules`, `audit`, `registry`) are
      deleted; apart from comments they matched the kit's.
- [x] One local file remains, `polyfills/native-crypto.js`, imported right after the
      kit's polyfills. It provides:
      - native Ed25519 behind `crypto.subtle`, which the kit lacks: 169 ms per verify
        in pure JS on the S7, against 0.72 ms native;
      - the kit's own `installNativeDigest`, called at boot.

      This is what gotchoices/sereus#33 (ours, open since 2026-10-06, unreviewed)
      adds to the kit as `/polyfills/native-crypto`. #33 is still based on the #32
      branch, although #32 has merged. When a release carries it, the import
      becomes the kit's and the file goes.
- [x] Boot audit on both phones:
      - no MISSING globals;
      - `crypto.subtle.importKey` native, so Ed25519 is filled;
      - no native-crypto warnings.
- [x] Two-phone check before restart: 3 rounds each way, none missed. Commit
      median 2.8 s / 3.4 s, delivery median 4.8 s / 4.9 s.
- [x] Restart check on a quiet machine (load average 5).
      - Launch to node running: emulator 28 s, S7 34 s.
      - Strand start: emulator 5.6 s, S7 19.9 s.
      - Both writable 40 s after the harness connected; 2 rounds each way, none
        missed.
- First attempt, on a loaded machine:
      - **What happened:** after restarting both, the emulator's strand was still
        starting at 90 s. The harness then failed one send and could not arm its
        watch.
      - **No message was lost:** both of the S7's messages reached the emulator.
      - **Timeline on the emulator:**
        - launch to boot audit: 59 s (Metro serving the dev bundle);
        - audit to node start: 65 s;
        - node start to running: 25 s (4 s in 2a);
        - strand start: 32 s.
      - **Why it can't be compared:** the Mac's load average was 341 (a parallel
        NDK build, not ours), so these times do not separate 2b from the
        machine.
      - **Harness fix:** `devtime.mjs` now waits for both strands to be
        writable (`ARM_WAIT_MS`, default 5 min) and reports how long that took,
        instead of relying on a fixed sleep.

**2c. The background runner.** (done 2026-10-12)
- [x] `createBackgroundRunner({ ...phoneNodeLifecycle(phone), appState: AppState })`,
      started after the first successful start.
      - **Background:** it hibernates every non-realtime strand (`hibernateAll`) and
        keeps the control node up.
      - **Return:** it restarts the node from its saved start if the process lost it,
        and waits, bounded, for the control network.
- [x] **The kit never wakes the strands, so chat does.** The kit wakes a hibernated
      strand only on a push (`serviceWake`). With the runner alone, the first send
      after returning failed with "database not available (status: hibernating)",
      and the other phone's message was not seen. Three changes:
      - `CadreService` wakes every hibernated strand, one at a time, once the runner
        reports the foreground. Measured after 30 s in the background: 14.5 s on the
        emulator, 19.1 s on the S7.
      - `ensureAwake(strandId)`: the adapter's `strandFor` waits for a hibernated or
        waking strand, sharing the sweep's wake, instead of failing. A send made 3 s
        after returning committed in 31 s (16.8 s of wake, then the write) and was
        delivered.
      - Waking rebuilds the strand with a new database, so `watchStrand` follows
        the strand. It drops its subscriptions on `strand:hibernating`, re-attaches
        on `strand:waking`, and reports a change. Callers keep one subscription.
- [x] Two-phone check, each phone in turn sent to the background for 30 s and
      brought back: all messages delivered both ways, watches working after the
      wake (the harness's "seen" depends on them). Commit 2.7–5.3 s, delivery
      5.4–11.6 s.
- Follow-up: the first write after a wake is slow (about 14 s). Look at it with the
  device profiling tools when strand reactivity (2d) is settled.

**2d. Strand reactivity, as its own experiment.** (done 2026-10-12: stays off)
- [x] A/B on the same phones and strand, quiet machine. Each side: restart both, 3
      rounds each way, 60 s of idle traffic, then the emulator in the background for
      30 s and back, and 1 round.

      | | Off | On |
      |---|---|---|
      | Commit median (A→B / B→A) | 3.8 / 3.3 s | 5.3 / 7.0 s |
      | Delivery median | 6.2 / 5.5 s | 11.1 / 12.5 s |
      | Idle strand streams per minute (emulator / S7) | 137 / 138 | 220 / 219 |
      | of which `sync` | 8 / 7 | 22 / 19 |
      | of which fret (inbound) | 51 / 56 | 78 / 85 |
      | Wake after the background | 17.3 s | 29.0 s |
      | Delivery after the wake | 9.4 / 15.3 s | 37.5 / 33.2 s |

      Worse on every measure, so `STRAND_REACTIVITY` stays `false`. The comment in
      `src/data/config.ts` now carries these numbers instead of the proof-of-work
      cost, which optimystic 1.12 replaced with a signed self-endorsement. Single
      runs; the gaps are large and all point the same way.
- Note: with StrandList on watches (2026-10-09), idle `sync` streams are now 7–8 a
  minute, against 20–29 before. Fret is the largest share of idle traffic
  (gotchoices/Fret#2).

**Phase 2 is complete.** `apps/mobile` runs on the kit's node, polyfills (plus the
Ed25519 file until sereus#33) and lifecycle runner.

## Phase 3 — `packages/core` skeleton and `protocol` (done 2026-10-12)

- [x] `packages/core`: `@chat/core`, private, ESM, TypeScript 5.9, vitest 4, `tsc`
      build to `dist/`. Its only peer dependency so far is `@serfab/cadre-core`
      (used for types). Rule: the core's runtime dependencies are all peers.
      Anything else would resolve from the repo root's `node_modules`, which the
      app's bundler blocks.
- [x] `apps/mobile` depends on it as `link:../../packages/core`.
      - `yarn core:build` runs first in `start`, `android`, `android:emu`, `test`,
        `typecheck`, the fastlane `build:*` scripts and `detox:build:android`. Yarn
        4 does not run `pre*` scripts.
      - The repo root is already a Metro watch folder, so `packages/` needed no
        new `watchFolders` entry.
- [x] Linked code resolves the app's copy of the stack:
      - **Metro:** `resolveRequest` resolves the core's peer dependencies as if the
        app had imported them, when the importing file is under `packages/`. The
        peer list is read from `packages/core/package.json`. Probed with a
        temporary runtime import of cadre-core in the core: the bundle held one
        cadre-core, the app's.
      - **Jest:** `jest.resolver.js` does the same, and also for
        `@babel/runtime/*`. The app's Babel transform inserts those helpers into
        linked code, which then looked for them beside its own path. That was the
        first failure, as the docs predicted.
- [x] Build check: Metro's `resolveRequest` records each resolution into
      `@serfab/cadre-core` or `@libp2p/interface` and fails the bundle if a second
      root appears, naming both. Checked by feeding the resolver two roots.
- [x] Lint rule: `no-restricted-imports` on the stack's scopes in
      `apps/mobile/.eslintrc.js`, allowed in `src/cadre/` (the host until Phase 5),
      `polyfills/` and `index.js`. **22 violations** at the start:
      - `diagnostics/two-party-check.ts`: 8;
      - `diagnostics/found-strand-check.ts`: 6;
      - `data/adapters/sereus.ts`, `data/chat-operations.ts`, `data/chat-sapp.ts`:
        2 each;
      - `data/chat-strand.ts`, `data/persisted-names.ts`: 1 each.

      Phases 5, 6 and 8 take this to zero.
- [x] Schema codegen: `packages/core/scripts/gen-schema.mjs` writes
      `src/protocol/schema.generated.ts` from `chat-sapp.qsql` on every build,
      typecheck and test. The output is gitignored. The Metro `.qsql` transformer
      branch and the `qsql` source extension are gone; the transformer stays,
      because it points Babel at the app's `babel.config.js`.
- [x] Moved into `core/protocol`:
      - from `chat-sapp.ts`: `CHAT_SAPP_ID`, `CHAT_SAPP_VERSION`,
        `getChatSAppConfig`, the schema DDL;
      - all of `inviteLink.ts`.

      `protocol` imports nothing else from the core (a type from cadre-core only).
      The app's `chat-sapp.ts` keeps `createChatStrand` and `joinChatStrand`, which
      need a node, until Phase 5. `inviteLink.ts` is deleted.
- [x] Checks:
      - Core: 5 vitest tests pass (invite-link forms, the sApp config and schema).
      - App: `tsc` clean. Jest: `persisted-names` and the new `core-link` test pass.
      - A one-off Android bundle includes the core's modules, with no
        duplicate-copy error.
      - Two phones: 2 rounds each way, none missed (commit median 4.1 s / 5.3 s,
        delivery 7.3 s / 11.0 s).
- Already failing, not caused by this phase:
  - `__tests__/App*.tsx` fail on an unmocked `react-native-keyboard-controller`.
  - `e2e/*.e2e.test.js` are Detox tests that plain `jest` also picks up.

  Both fail the same way without the new resolver.
- Metro reads its config at startup: restart it with `--reset-cache` to get the pin
  and the check. The phone check above ran on the old config, which is safe only
  because the core does not import the stack at runtime yet.

## Phase 4 — `ChatModel` and the mock (done 2026-10-12)

- [x] `ChatModel` in `core/model`, one file per namespace, each holding its shapes,
      policy and slice of the interface. The namespaces: `strands`, `messages`,
      `members`, `invitations`, `media` (attachments and storage), `search`,
      `profile`, `prefs`, `reachability`, `changes`.
      - The shapes moved from the app's `types.ts`, which now re-exports them.
      - Operations return `Result<T>` (`ok` / `fail`). `search.run` yields
        `Result<SearchBatch>` items.
      - `changes.strands(fn)` and `changes.strand(id, fn)` return unsubscribe
        functions and must outlive hibernation.
      - Shared policy lives here too: `isSettled`, `INVITATION_VALIDITY` and
        `defaultInvitationTerms`.
      - Not yet in the interface:
        - the cadre-manager operations (Phase 6, with their store);
        - drafts and read cursors (Phase 5).
- [x] `ChatError { kind, retryable, message, cause }` with 13 kinds.
      - `message` is English, for logs and, until the string catalogs (Phase 7),
        for display.
      - `explainJoinFailure` in the app's Sereus adapter now returns errors that
        carry these kinds: `join-inviter-unreachable`, `invitation-spent`,
        `invitation-not-ready`, `join-refused`, `join-host-busy`,
        `join-host-outdated`, `join-incomplete`, `invitation-unusable`.
- [x] The mock moved to `core/mock`: `createMockModel(fixtures)` returns
      `{ model, controls }`.
      - The variant (`happy`, `empty`, `error`, `unreachable`) belongs to each
        instance, not a module global.
      - Writes and variant changes fire the change signals.
      - The app supplies `src/data/mock-fixtures.ts`, the repo root's `mock/data`
        as static `require`s. `apps/mobile/mock` was already a symlink to it.
      - The old `adapters/mock.ts` is deleted.
- [x] Transitional `src/data/legacy-adapter.ts`: the throwing, flat `DataAdapter`
      over a `ChatModel`.
      - An error result is thrown as an `Error` with `kind` and `retryable`, and
        `unreachable` becomes `UnreachableError`.
      - The mock path uses it now; the Sereus model will in Phase 5. Deleted in
        Phase 6.
- [x] The core declares the few host globals it uses (`setTimeout`,
      `AbortSignal`, `console`) in `src/globals.d.ts`, instead of the DOM or Node
      libraries. Its tests get Node types; the build does not.
- [x] Contract suite (`core/src/testing/contract.ts`,
      `describeChatModelContract`) runs against the mock. It checks:
      - unique strand ids and plausible summaries;
      - `settled` agrees with `isSettled`;
      - exactly one member is this device;
      - a sent message comes back newest-last and signals the strand;
      - an invitation's link carries its token;
      - prefs merge and the profile round-trips;
      - search batches end with every strand searched.

      The fixtures pass it. Core: 15 tests pass.
- [x] App:
      - `tsc` clean.
      - Jest: 7 tests pass, including `mock-adapter.test.ts` (every bundled
        fixture served; an error result throws with its kind; `unreachable`
        throws `UnreachableError`).
      - Lint: 22 stack-import violations, unchanged.
      - Two phones, under the restarted Metro with the pin: 2 rounds each way,
        none missed, no resolution errors.

## Phase 5 — The Sereus model over a host (done 2026-10-12)

- [x] `ChatHost`, `NodeHost` and `SlotName` in `core/sereus/host.ts`, exported from
      `@chat/core/sereus`.
      - The host interface is what the core actually needs: `node`,
        `ensureStarted`, `on`, `onRebuilt`, `getRelayAddrs`, `applyRelays`, plus
        the slots. app-family.md, *The host*, is updated to match.
      - `createExtraNode` waits for Phase 8.
- [x] Into `core/sereus`, with no module-level AsyncStorage, `rn-leveldb` or
      `cadreService`:
      - `model.ts`, from `adapters/sereus.ts`: `createSereusModel(host)` returns
        `{ model, boot }`, and every operation goes through `attempt` into a
        `Result`;
      - `strands.ts` (`StrandRuntime`), from `chat-strand.ts`;
      - `operations.ts`, from `chat-operations.ts`;
      - `sapp-strands.ts`, from `chat-sapp.ts`;
      - `local-state.ts`, from `strand-prefs`, `strand-summary-cache`,
        `outgoing-invitations` and the profile, prefs, drafts and read cursors;
      - `errors.ts`: `ChatFailure` and `toChatError`. `explainJoinFailure` moved
        here; the stack's timeouts and quorum failures classify as
        `unavailable`.

      The seven app modules are deleted. `data-format.ts` stays in the app: it
      scans the app's own storage before any model exists.
- [x] New in the model:
      - `strands.settings(id)` (for `StrandDetail`);
      - `messages.draft` / `saveDraft` / `readCursor` / `saveReadCursor`.
        `ChatInterface` no longer touches AsyncStorage.
- [x] Discovery and re-attach subscribe through `NodeHost.on`, which `CadreService`
      keeps across restarts. `changes.strand` follows its strand: it attaches
      whenever the database appears (started, writable, waking) and detaches when
      it goes (hibernating, stopped).
- [x] Waking moved into the core. A read or write wakes a hibernated strand,
      including one the app's return sweep is already waking (`starting`, no
      database). Without that, a send 3 s after returning failed, as before 2c.
      `CadreService.ensureAwake` is gone; the host keeps its sweep.
- [x] `apps/mobile/src/host/` (was `src/cadre/`):
      - `CadreService` (the kit's phone node);
      - `chat-host.ts`, the `ChatHost` over it, with each slot an AsyncStorage
        key from `persisted-names.ts`.

      The adapter's Sereus path is
      `adapterFromModel(createSereusModel(chatHost).model)`, and `App.tsx` boots
      through `bootSereus()`. The core is imported **statically**: a dynamic
      `import()` of the linked package failed on the phones with "Could not load
      bundle", because Metro's lazy bundles cannot reach outside the app folder.
- [x] Node test host (`core/src/testing/node-host.ts`): cadre-core nodes with
      `MemoryRawStorage`, memory slots, and an in-process circuit relay with
      unlimited reservations.
- [x] `prefs` and `reachability` read relays through `NodeHost.getRelayAddrs`; no
      relays in a slot.
- [x] Contract suite on the Sereus model, both topologies, plus a two-sided test
      (a message each way; each side lists both members):
      - **loopback:** both listen on 127.0.0.1;
      - **relay-only:** neither listens, and the test asserts every address is a
        `/p2p-circuit` through the in-process relay.

      Core: 37 tests pass in about 10 s.
- [x] App: `tsc` clean; Jest 7 pass. Lint: **14** stack-import violations (from
      22), all in `diagnostics/` (Phase 8). The data layer has none.
- [x] Two phones on the core model:
      - The strand reattached on both through the core's boot.
      - 3 rounds each way, none missed: commit median 4.8 s / 4.7 s, delivery
        8.7 s / 10.1 s (Phase 4: 4.8–6.2 s and 10–12 s).
      - Emulator in the background for 30 s, back, send 3 s later: waited for
        the wake (12.7 s) and delivered. All messages arrived.
- Harness fix: the bridge's `arm` now succeeds only once the strand can be read. A
  watch subscribes even before a strand opens, so arming said nothing about
  readiness, and the first send went out mid-start.

## Phase 6 — Stores (done 2026-10-12)

Done in steps, each type-checked and run on a phone.

- [x] **6a. Primitives** (`core/stores`).
      - `writable` (the Svelte contract plus `get()`, stable snapshots,
        reference-counted start and stop) and `derived`.
      - `loader`: `loading`/`ready`/`failed` over `Result<T>`, with `error` kept
        beside a stale value. Change-driven, debounced, one read at a time with
        one more if asked during a read, and an optional backstop poll.
      - App: `src/data/model.ts` (the one `ChatModel`, chosen by `USE_SEREUS`) and
        `src/data/bind.ts`:
        - `useStore(store, active)`, where `active` false (an unfocused screen)
          stops the store's work;
        - `useModel()` and `useLoader()`;
        - `orThrow`, in `or-throw.ts`.
- [x] **6b. Strand list.** `strandListStore` reads strands, invitation counts,
      member names, settling and boot error.
      - It re-reads on `changes.strands` and on a watch for every listed strand,
        polling every 3 s while settling and every 60 s after.
      - `sortStrands` and `matchesStrand` (the mute and mention ranking, and
        narrowing) are core policy.
      - The screen binds only while focused. Its polling and `watchStrand` wiring
        are gone.
- [x] **6c. Chat.** `chatStore` reads messages, members, state, the invitation
      count while nobody else is here, and `opening`.
      - `send` shows a pending row (`isSending`) until the stored message
        replaces it, or, on failure, drops it and returns the error. `edit`
        shows at once; `delete` and `react` re-read.
      - It re-reads on `changes.strand`, polling every 10 s while opening and
        every 30 s after.
      - On the S7: the list and chat rendered from the stores, and a message
        typed in the composer showed "Sending…", then stored.
- [x] **6d. Invitations and reachability.**
      - New in the model: `changes.reachability`. `Reachability` gains `relays`
        and `relayStatus`. The host adds `relayStatus()` and
        `onReachabilityChange()`, driven by `CadreService`'s address watcher and
        its node status.
      - New stores: `reachabilityStore` (event-driven, 30 s backstop) and
        `outstandingInvitationsStore`.
      - The navigator's relay section dropped its 4 s poll and
        `InvitationGenerator` its 3 s recheck. The generator detects "nowhere to
        answer" by the `unreachable` kind.
- [x] **6e. Every other screen on the model; the adapter deleted.**
      - `StrandDetail`, `InvitationAcceptance`, `Profile`, `Settings`,
        `RelayOffer`, `SearchInterface`, `StrandMedia`, `MediaViewer`,
        `Diagnostics`, the dev bridge and `two-party-check` all use
        `useModel()`/`chatModel` with results; one-call try/catch blocks use
        `orThrow`.
      - Deleted: `data/adapter.ts`, `legacy-adapter.ts`, `types.ts`, `errors.ts`.
        `src/data/` is now `model`, `bind`, `or-throw`, `config`, `data-format`,
        `mock-fixtures`, `persisted-names` and `attachmentDraft`.
      - Fixed on the way: the bridge's `traffic` had lost the control node since
        2a (it read a removed field), and leave/forget failures now show instead
        of being dropped.
- [x] **6f. Cadre manager**, on sereus 1.14's claiming model (the one health
      uses). The screen renders on the S7 and the emulator. A real claim from a
      phone waits for a claimable node (a `test/stack` script or cadre-cli),
      deferred by choice.
      - Core: a `cadre` area on the model (`status`, `inspectNodeCode`,
        `claimNode`, `removeMachine`, `exportOwnerKey`), `changes.cadre`, and
        `cadreManagerStore`. It is implemented in the Sereus model, the mock and
        the Node test host.
      - `sereus/node-code.ts` is health's node-code reader and claim-failure
        sorter, ported. It is marked interim: two copies until sereus has a home
        for it (#45). Not yet raised on #45.
      - Node test: a real claim of a node started with `claim: {secret, record}`,
        and a damaged code refused.
      - App: `cadre-ui/CadreManager` takes the model as a prop.
        - It shows the status strip, network id, owner key (fingerprint, guarded
          backup) and the machines list (remove).
        - To add a machine: scan or paste its code, read it, approve (peer id,
          owner fingerprint, reach), then claim, with retry when it can help.
        - The scanner sends a node code to it (`popTo`).
        - On mocks it renders the sample cadre instead of a placeholder.
      - Removed: the pre-1.14 seed flows (`createDroneSeed`, `applySeedFromCode`),
        the key import, the late-genesis path, `useCadreManager` (which read the
        stale `AuthorityKey` table), `KeyImportModal`. `SeedApplyModal` became
        `NodeCodeModal`.
      - Specs: story 42 and `cadre-manager.md` amended to claiming at low detail
        (consented); `cadre-ui/SPEC.md` rewritten.
      - Not done: opening a `sereus-join:` link from outside the app. Every
        sereus app on the phone would claim that scheme; that is a question for
        sereus.
- Checks:
  - Core: 51 tests, including the stores against the mock (pending and
    failed sends, strand-list contents, mute ranking) and a real node claim.
  - App: `tsc` clean; Jest 7 pass (`App*.tsx` still fail as before).
  - Lint: 14 stack-import violations, all in `diagnostics/` (Phase 8), so
    "zero" waits for Phase 8.
  - Two phones (bridge path): all messages delivered.
  - The S7's loop sits at 5–11% blocked with the list on screen.
- Open: the emulator's loop is 51–55% blocked even when idle, and its strand took 44 s to
  open (5.6 s in the 2b recheck).
  - **Why it looks like the emulator:** a CPU profile shows no store code
    among the busy functions; the time goes to network encryption and
    streams, as in the S7's idle profile. Android's own `system_server` and
    `surfaceflinger` sit at about 65% CPU each.
  - **Likely cause:** recovery from the cache trim and app recompile after
    the 2a install.
  - **To do:** cold-boot the emulator and re-measure before trusting its
    numbers.

**→ `apps/web` can start here.**

## Phase 7 — `packages/resources` (done 2026-10-12)

- [x] **Strings.** `@chat/resources` holds the shared catalogs
      (`strings/en.json`, `es.json`): 244 keys plus errors and statuses.
      - **What is shared:** keys are by meaning (`invite.historyWarning`), not by
        screen. Shared means the words any chat app would say the same way:
        concepts and their consequences, states, `common`/`actions` words, and
        `errors.<kind>[.<reason>]` for every `ChatErrorKind`. A test checks that
        every kind has words, and that other locales add no keys English lacks.
      - **What the app keeps:** its own words in
        `apps/mobile/src/i18n/locales/<l>/app.json` (28 keys). That covers device
        features (scanner, media picker, saving to the phone's library),
        phone-specific wording ("your phone needs a relay") and its own
        navigation labels. An app may override any shared key.
      - `createTranslator(locale, appCatalogs)` looks in the app's catalog first,
        then shared, then English, and fills `{{name}}` placeholders.
        `errorText` words a `ChatError` by reason, then kind, then the core's
        message.
      - The app's `useT()` is now that translator. The `screens.` prefix is gone
        from keys.
      - The in-code fallback texts were removed (301), so code and catalog cannot
        drift. They already had: `strand.forgetBody` differed, and the catalog's
        text, which was what showed, was kept.
      - Displayed model errors go through `useErrorText()`.
      - Strand status and relay status words come from `status.*`.
      - Core changes: `CHAT_ERROR_KINDS`; a `not-supported` kind for operations
        the Sereus model cannot do yet (they were `unexpected`); reasons
        `owner-not-ready` and `busy`; `strandStatusKind` moved into the core.
- [x] **Tokens.** `tokens/colors.json` (light, dark, avatar palette) and
      `tokens/layout.json` (type, spacing, radius, hit slop).
      `ThemeProvider`, `useTheme` and `colorHash` read them; values are unchanged.
- [x] **Brand.** The canonical logo moved from `docs/images/logo_3_m.svg` to
      `packages/resources/brand/logo.svg`; the icon scripts and image README
      point there.
- Build: JSON is the source. `scripts/gen-data.mjs` embeds it into TS, so Metro,
  Vite, Node and a CLI all import plain JS. The app's `core:build` builds
  resources, then core.
- Checks:
  - Resources: 5 tests. Core: 51.
  - App: `tsc` clean; Jest 7 pass.
  - S7: the strand list and network screen render from the catalogs.
  - Two phones, S7 and emulator, 3 rounds: all delivered. Delivery medians were
    13.1–14.0 s against Phase 5's 8.7–10.1 s. Nothing here touches the message
    path; the emulator had just restarted (18 s to arm). Re-time on a settled
    emulator.
- Not done: string literals that never went through `t()` (alerts and labels in
  several screens, the cadre manager's `STRINGS`). Sweep them when a second
  locale or app needs them.

## Phase 7a — `apps/cli` (serchat) scaffold (2026-10-12)

A command-line client for testing, evaluating and debugging; chosen ahead of the
web app. No background process: each run starts the node (seconds), and
interactive mode is the way to avoid that.

- [x] Stories (`design/stories/cli/`, five short ones) and a command and output
      spec (`design/specs/cli/commands.md`).
- [x] `apps/cli` is a workspace member, so it shares the core's single copy of
      the stack. esbuild bundles `@chat/*` into `dist/serchat.js` and leaves the
      stack as npm `dependencies`.
- [x] **Host:** a cadre-core node shaped like the phone's, with file-backed
      stores from cadre-core and optimystic (`FileKeyStore`, the file
      trusted-owner, bootstrap, machine and strand-state stores,
      `FileRawStorage`).
      - It lives in `~/.serchat/<profile>/`: owner-only modes, the core's slots
        as files.
      - `--listen` uses a port chosen per profile and kept.
- [x] **Commands:** `status`, `profile`, `prefs`, `relay`, `network`,
      `strands`, `log`, `tail`, `send`, `members`, `mute`, `archive`,
      `unarchive`, `leave`, `invite`, `invites`, `join`, `help`.
      - Tab-separated or JSON lines, rows remembered for row references, and
        exit codes from the error's `retryable`.
      - Words come from `@chat/resources`.
- [x] **Ways to run:** interactive (history, completion), one-shot (`\;`
      separated), `-c`, and scripts on stdin (newlines and `#` comments).
      - One-shot waits, bounded by `--wait`, for the relay reservation and for
        strands to open.
- Checks:
  - 7 unit tests (lexing, output, naming).
  - Two profiles through a local relay: a join; Bob → Alice delivered about
    2 s after sending, to Alice's `tail`; Alice restarted, sent with a 1.3 s
    commit, delivered to Bob's `tail` about 2 s later.
  - Interactive mode tested through a pseudo-terminal.
- Found:
  - **Two profiles listening directly (no relay):** Bob → Alice worked, but
    after Alice restarted her messages did not reach Bob within 90 s, even with
    stable ports. Through a relay the same sequence works. Not pursued; the
    relay is the phones' topology.
  - A strand of two does not open while the other member is offline (shown as
    `(opening)`), as on the phones.
  - The Sereus model never fills `inviterName`, so `join` shows the
    unattributed wording, as the phone does.
  - The relay on port 4002 (started Oct 5 from sereus's libp2p-infra) is not
    the one `.relay-data` describes: its peer id differs, so reservations
    against `.relay-data`'s id retry forever. The test used a separate relay on
    4011/4012, since stopped.
- [x] **The development bridge moved into the core** (`@chat/core/diagnostics`,
      `createDevBridge(model, nodeHost)`); this is Phase 8's first item.
      - The phone installs it in development builds.
      - `serchat --bridge <port>` installs it behind Node's inspector on loopback.
      - `test/devices/target.mjs` lets `devtime.mjs` and `devcall.mjs` take
        `node:<port>` as a device.
      - New `idle` command keeps serchat's node running for a tool to drive.
- [x] **serchat ↔ S7 through `relay.sereus.org`** (`devtime.mjs`, `PAIR=1`,
      3 rounds):
      - serchat invited in 12 s; the S7 joined in 86 s;
      - all 6 messages delivered;
      - median delivery 5.3 s (serchat → S7) and 5.8 s (S7 → serchat);
      - commits about 3.2 s, apart from the first at 10 s.
- Fixed on the way:
  - **Profile lock.** A profile is locked to one process (`lock` holds the pid;
    a lock left by a dead process is taken over). Two runs on one profile, which
    happened during testing, would have damaged its storage.
  - **Strands no one had listed.** Every run lists strands once before stopping,
    so the core saves its list and the next run knows which strands to wait for.
    Before this, a strand that arrived only through the bridge was unknown to the
    next run until rediscovered, about 18 s after start.
  - **Message paging, in the core.** `messages.list` ignored `before` and
    `limit` in both the Sereus model and the mock. Shared `pageMessages`, with a
    test; core now has 56 tests.
  - `status` names this node's reachable addresses `address`, not `listen`.
- Fixed 2026-10-13, from first hands-on use:
  - **`relay add` takes a host name.** It uses the published `_dnsaddr`
    address, or WebSocket on 4011 with the peer id learned by connecting.
    It waits for the restart and the reservation, and refuses the same relay
    twice.
  - **Interactive questions.** `join`'s question opened a second reader on the
    terminal; the answer also ran as a command, and closing that reader paused
    input, so the next command hung. The prompt now owns its questions (one
    event-driven reader).
  - README: a two-terminal walkthrough, captured from a real run.
- **Deferred (decided 2026-10-13):** attachments; reactions (emoji on a message);
  search (dump with `log -n <many>` and filter with ordinary tools instead).
- Not done yet: edits and deletes, claiming.

## Phase 7b — serchat as the Sereus testbed (planned)

Research, decisions and plan: [serchat.md](serchat.md). It covers how Sereus v1.14
organises parties, members, nodes and owner keys; the backup-key recovery proof; what a
serchat profile is; and the steps below.

- [x] Offline backup owner key recovery proven in v1.14
      (`test/stack/owner-recovery.mjs`, three runs of three, about 33 s).
- [x] 0. **Upgrade to sereus 1.15.0** (optimystic 1.13.0). Done 2026-10-13.
      - Why: native Ed25519 on phones (our sereus#33), the ~18 s strand open
        (#34), redial and owed writes (#44), commit durability, `removeMachine` and
        `listMachines`, apps joining an existing cadre, `cadre init`/`code`.
      - Breaking: parties must be recreated (`DATA_FORMAT` bump).
      - Order: Node side first (core, serchat, `test/stack`; rerun the core tests
        and `owner-recovery.mjs`), then mobile (kit native-crypto polyfill,
        `LevelDBNative.destroy`, new `joining`/`removed` states, owner genesis
        `member`), then S7 ↔ serchat.
      - Node side done, 2026-10-13:
        - `use-stack.sh` moved to 1.15.0 / optimystic 1.13.0 and gained
          `db-p2p-storage-fs`; it now treats `apps/cli` as a workspace member
          (dependencies only, no resolutions). One copy of cadre-core (1.15.0).
        - Core 56 tests pass; the stack check converges.
        - `owner-recovery.mjs` passes on 1.15 (35 s).
        - serchat on `relay.sereus.org`:
          - Bob joins, lists and sends in 27 s; Alice's `tail` has it 1.8 s
            after sending.
          - After a restart, Alice's whole run takes 4 s (7 s on 1.14);
            delivered 2 s after sending.
        - serchat profiles now record `dataFormat` (`sereus-1.15`); older ones
          are refused with a message.
        - Still failing on 1.15: two profiles with `--listen` and no relay; after
          one restarts, its messages do not reach the other within 2 minutes.
          Relayed (the phones' topology) works.
      - Mobile, checked on the S7 2026-10-13:
        - the kit's `/polyfills/native-crypto` replaces our local copy (deleted);
        - `LevelDBNative.destroy`;
        - the `removed` status is handled (logged and reported; UI in step 8);
        - `DATA_FORMAT` is `sereus-1.15`.
        - `tsc` clean; Jest 7 pass.
- [ ] 1. Core: cadre administration in `ChatModel.cadre`.
      - Owners, the anchor, and members.
      - Authorize by peer id; cadre invitations.
      - Add and remove owners; create a backup key.
      - The party's strands at control level.
      - The mock gets the same.
- [ ] 2. serchat `init found | seed | invitation | claimable | identity`.
- [ ] 3. serchat `cadre …` commands, including `backup create`.
- [ ] 4. Chat member identity = the party (domain contract); display name in the
      Member row.
- [ ] 5. Core fixes: leaving joined strands (`forgetJoinedStrand`), the
      `joinedStrands` list, `isManager`.
- [ ] 6. Background mode (local socket; later invocations attach).
- [ ] 7. Shared serchat config.
- [ ] 8. The phone takes up what proved out.

## Phase 7c — Tests across the family (planned 2026-10-13)

Most testing is already outside `apps/mobile`: core contract tests with real nodes,
`test/stack`, `test/devices`. What is missing is automated two-person scenarios and GUI
tests against a known counterpart. serchat provides both.

- [x] 1. **Baseline:** the S7 on the 1.15 build against serchat, through
      `relay.sereus.org`, 3 rounds, done 2026-10-13.
      - The S7 showed the old-data screen; its data was cleared and it was set up
        new. The kit's native Ed25519 is active (boot table).
      - Results, with 1.14 in brackets:

        | | 1.15 | 1.14 |
        |---|---|---|
        | serchat invites | 13 s | 12 s |
        | The S7 joins | 35 s | 86 s |
        | Messages delivered | 6 of 6 | 6 of 6 |
        | Commit median | 2.8–2.9 s | about 3.2 s |
        | Delivery median, serchat → S7 | 3.9 s | 5.3 s |
        | Delivery median, S7 → serchat | 4.8 s | 5.8 s |

- [x] 2. **Scenario suite, serchat processes** (first pass done 2026-10-13):
      `apps/cli/test/`, `yarn workspace serchat scenarios`, about 4 minutes.
      - The harness spawns the built serchat per person (temporary home,
        `--json`, one-shot or background), with a loopback relay started in the
        test.
      - Passing: invite/join/talk both ways with the inviter restarted in
        between; a join while the inviter is offline exits 3 (retryable) and
        succeeds once the inviter is back.
      - **Leaving a joined strand does not stick:** the strand is back after
        Bob's restart. Expected failure (`it.fails`) until Phase 7b step 5. It
        needs Bob to run past a reconcile pass before leaving, and 40 s after,
        to show.
      - Unit tests (`src/`) and scenarios (`test/`) have separate vitest configs.
- [ ] 2b. More scenarios as features land: cadre operations and recovery
      (Phase 7b), member identity (one person, two nodes).
- [x] 3. **Diagnostics into the core** (done 2026-10-13). Each check is written
      once in `@chat/core/diagnostics`, with the platform parts passed in, and runs
      in Node and on the phone:
      - `startLoopLag` and `runCryptoCost` (now also times WebCrypto Ed25519, the
        path libp2p uses with a native one);
      - `runFoundStrandCheck` (storage, transports and identity passed in);
      - `runTwoPartyCheck`, whose nodes come from the host's new
        `createExtraNode` (phone: `src/host/extra-node.ts`).
      - Node: core tests (60 now), and `test/stack/found-strand.mjs` and
        `handshake-cost.mjs` became thin runners over the same code.
      - Phone: thin triggers. The bridge gained `diagnose crypto|found|two-party`,
        so the device tools can run them. **Stack-import lint violations: 14 → 0.**
      - S7 results:

        | | S7 | Node |
        |---|---|---|
        | Ed25519 verify, WebCrypto (native) | 0.43 ms | 0.15 ms |
        | Ed25519 verify, pure JS | 83 ms | 2.6 ms |
        | x25519, pure JS | 58 ms | 2.6 ms |
        | Found strand | 5.6 s | 0.2 s |
        | Two-party, converged | 4.6 min | seconds |

        The two-party run on the S7: founding at 72 s, joiner attached at 159 s.
      - Lead: x25519 in pure JS is about 234 ms per Noise handshake on the S7.
        Whether the kit's Noise mode makes it native is worth checking.
      - **Fixed:** relays set while the node was starting were accepted, then
        dropped. After first-run setup the S7 came back with no relay.
        `CadreService` now restarts with settings changed during a start.
        Reproduced, then fixed, on the S7.
      - **Fixed:** the extra node lacked the kit's connection-gater setting, so on
        React Native it refused the ws:// relay.
      - **Seen once:** an in-place reload ("RR") failed to install Nitro
        (quick-crypto's native layer) and the app did not load. A full restart
        recovered.
- [x] 4. **GUI against serchat** (done 2026-10-13):
      `node test/gui/phone-joins-serchat.mjs [serial]` with
      `flows/join-and-talk.yaml`. **Passes on the S7 in about 4 minutes.**
      - serchat (bridge) makes a strand and an invitation; Maestro opens
        `chat://invite/<token>` on the phone, taps `invite-accept`, and sends
        from the composer.
      - serchat sees the message (`arm`/`seen`) at about 230 s and replies
        (commit 4.6 s); Maestro sees the reply on screen.
      - Flows take `APP_ID`, for NativeScript later. Test IDs `invite-accept`,
        `invite-decline` and `composer-send` added; `test/devices/bridge.mjs` is a
        reusable bridge client.
      - **Maestro 2.11.0**, from its own installer into `~/.maestro`. Homebrew's
        tap failed to build on this Mac, and Homebrew's `maestro` cask is an
        unrelated product. Analytics off (`MAESTRO_CLI_NO_ANALYTICS=1`). It puts
        driver apps on the device.
      - **Fixed:** the bridge's start-and-poll path failed on methods that answer
        at once (`seen` returns a value, not a promise).
- [x] 5. **`test/stack` tidied** (2026-10-13). Nothing deleted: those scripts are
      bare-stack evidence for upstream. The README now has a table of each
      script's question and what else covers it; scripts are retired when their
      upstream question is settled.

## Phase 7d — Where the time goes (in progress 2026-10-13)

Question: the phones are slow; is it the engine, the build, the hardware or the code?

- [x] **Native x25519** (kit Noise `full` mode): no measurable change on the S7 (join
      35 → 36 s, delivery within noise). The handshake is not the bottleneck.
      - Found: `full` mode cannot start with quick-crypto 1.1.7, which returns DER as a
        bare `ArrayBuffer`. Patched locally for the measurement only, then restored.
        Noted for upstream in `docs/serchat.md`.
      - The phone bridge gained `noise([mode])`.
- [x] **CPU profile of a join** on the S7 (development build, 260 s):
      - the JS thread is ~89% busy, so a join is CPU-bound there;
      - ~20% Noise per-frame overhead (cipher objects per frame), 15.8% young GC,
        ~9% multiaddr and 7% peer-record churn, 2.4% `localeCompare` in libp2p's
        peer store, ~8% yamux windows, 5.6% `metroRequire`;
      - none of the app's own code is in the top of the profile.
      - Details: `docs/serchat.md` (Upstream).
- [x] **Release build on the S7** (debug-signed release APK, arm64, Hermes bytecode),
      same GUI test against serchat:

      | | Development | Release |
      |---|---|---|
      | Link → serchat sees the phone's message | ~203 s | ~121 s |
      | Whole run | 246–269 s | 162 s |

      About 40% of the phone's time in a join is development-build overhead. Phone
      measurements should be taken on release builds from now on (one run so far).
      - Build: `STORE_FILE_CHAT=$PWD/app/debug.keystore STORE_PASSWORD_CHAT=android
        KEY_ALIAS_CHAT=androiddebugkey ./gradlew assembleRelease
        -PreactNativeArchitectures=arm64-v8a`.
      - Installs over the debug build and keeps the data.
      - Play Protect asks to upload the app; answer "Don't send".
      - **The S7 (6a61c968) now runs the release build:** there is no dev bridge, so
        `devtime` and `devcall` do not work on it until a debug build is reinstalled.
- [x] **serchat pair, loopback relay** (2026-10-13): where serchat's 1 s per
      message went. Two serchats in one strand, sends timed through their bridges.
      - With blocks on disk, commit is ~1,015 ms, all of it inside one SQL insert
        into optimystic. Delivery is ~755 ms.
      - Optimystic's debug timeline: ~80 ms steps between local block writes, plus
        ~570 ms waiting on the peer's own writes.
      - Cause: `db-p2p-storage-fs` writes each block atomically (write a temp file,
        fsync, rename, fsync the directory). A commit writes several blocks in
        sequence on each side; about 80 ms per write on this Mac.
      - **With blocks in memory** (`serchat --memory-blocks`, measurement only):
        commit **45 ms**, delivery **≤ 250 ms** (devtime's polling interval),
        invitation 0.46 s, join **0.9 s**.
      - So the protocol is fast; serchat's slowness was durable file storage. Phones
        use LevelDB without fsync, so their time is CPU, as the profile showed.
      - For optimystic (prepared, not posted): coalesce a transaction's block
        writes (one fsync per commit, not two per block). For serchat: consider a
        faster durable store, or a storage choice.
      - Tools: `apps/cli/test/relay.mjs` (a loopback relay for hand runs) and
        `--memory-blocks`.
- [x] **NativeScript V8 probe** (`apps/mobile-ns`, stage 1, 2026-10-13).
      - Built from sereus's `reference-app-ns`: webpack configuration, polyfills,
        shims, SQLite storage. One diagnostics screen runs `@chat/core/diagnostics`.
        App id `org.sereus.chat.ns`. Maestro flow `test/gui/flows/ns-diagnose.yaml`;
        results logged as `[diag]`.
      - **Pure-JS CPU on the S7, V8 against Hermes** (NativeScript debug build
        against the RN development build):

        | | Hermes | V8 | V8 faster by |
        |---|---|---|---|
        | x25519 | 58.5 ms | 18.0 ms | 3.2× |
        | Ed25519 sign | 42.3 ms | 16.4 ms | 2.6× |
        | Ed25519 verify | 83.3 ms | 17.6 ms | 4.7× |
        | ChaCha20 frame | 6.94 ms | 0.71 ms | 9.8× |
        | SHA-256 frame | 13.7 ms | 0.33 ms | 42× |

      - No WebCrypto Ed25519 under NativeScript, so libp2p signs in pure JS there.
      - **Found strand:** converged in 7.6 s (node start 13.7 s), against 5.6 s on
        RN. Not comparable: SQLite here, LevelDB there.
      - **Two-party under V8 on the S7: converged in 102 s**, against 278 s under
        Hermes (the RN development build; release Hermes is ~40% faster, so about
        170 s). Roughly 1.7–2.7× faster end to end. One run each; storage differs
        (SQLite here, LevelDB there).

        | Step (s from start) | Hermes | V8 |
        |---|---|---|
        | Host reachable | 17.5 | 11.2 |
        | Strand founded | 72.0 | 30.9 |
        | Joiner attached | 159.1 | 64.4 |
        | Converged | 278.1 | 102.1 |

      - Two NativeScript bugs had to be fixed first (`src/polyfills/chat.ts`):
        - **`queueMicrotask` missing** on NativeScript's V8; libp2p's relay code
          calls it.
        - **`@nativescript/core`'s `TextDecoder` ignores a view's `byteOffset`.**
          A self-test decoding `bytes.subarray(2)` fails on the S7. multistream-select decodes protocol names from such views, so
          every protocol negotiation failed ("did not read multistream-select
          header", "na" for an empty protocol): no identify, no relay. Startup
          self-test plus a wrapper that copies offset views. Found with
          `DEBUG=libp2p:*`.
        - The decoder bug was reported on NativeScript#9941 (root cause, repro,
          fix), 2026-10-13. Both bugs are still to raise with sereus's
          reference-app-ns.
      - Release builds do not send `console` output to logcat; use debug builds
        to read results. Release builds are signed with `~/.android/debug.keystore`
        too (`apps/mobile-ns/README.md`), so they install over a debug build and
        keep its data.

- [x] **`apps/mobile-ns` stage 2: the minimal twin** (2026-10-14). Strand list,
      invitation and chat screens over the core's Sereus model and stores, with the
      shared strings; Name… and Relay… buttons stand in for the profile and network
      screens. Links are `chatns://invite/<token>`. Details in `apps/mobile-ns/README.md`.
      - The GUI test runs both apps: `APP_ID=org.sereus.chat.ns node
        test/gui/phone-joins-serchat.mjs` picks `flows/join-and-talk-ns.yaml` (selects
        by on-screen words) and the `chatns` scheme. `flows/ns-setup.yaml` gives the
        app a name and relay. The driver now timestamps each Maestro step.
      - Android 8's SQLite (3.19) has no UPSERT, which optimystic's `SqliteKVStore` and
        `loadOrCreateNSPeerKey` use; the app writes the `kv` table itself
        (`src/local-kv.ts`). Not reported upstream (old-phone accommodation).
      - **Core fix, both apps:** opening an invitation link in an app the link had just
        launched failed at once with "Could not get through just now": `inspect` and
        `accept` required a running node. They now wait for it to start
        (`startedNode` in `sereus/model.ts`; test "a link opens a cold app"). Earlier
        GUI runs passed only because the app was already running.
- [x] **RN (Hermes) against NativeScript (V8), release builds on the S7**
      (2026-10-14). Same GUI test against serchat on relay.sereus.org; both apps
      force-stopped before each run, so each starts cold from the link; runs
      alternated, two each. Seconds:

      | | RN / Hermes | NS / V8 |
      |---|---|---|
      | Link → invitation offers Join | 20.6, 26.4 | 10.6, 11.8 |
      | Join tapped → conversation open | 60.1, 40.3 | 42.2, 36.7 |
      | Send tapped → serchat has it | 7.0, 9.8 | 11.6, 9.4 |
      | Link → serchat has the phone's message | 103.1, 90.0 | 82.5, 76.4 |

      - V8 is about 15–20% faster end to end, and twice as fast to the invitation
        screen (start-up), but the join itself is close. The 3–42× pure-JS gap and
        the 2.7× of the two-party diagnostic (development Hermes) do not carry over to
        a release-build join: it is mostly waiting on the network and the other side,
        not the phone's CPU.
      - Caveats: two runs each; storage differs (SQLite against LevelDB); the
        Maestro steps (typing, taps) add a few seconds to every row alike.
      - Release installs over `adb` can stop at a Play Protect "Send app for a
        security check?" prompt on the phone; answer "Don't send".

## Phase 8 — Diagnostics and the Node harness

- [x] The dev bridge is in `core/diagnostics` (done with Phase 7a).
- [ ] Move the rest of `src/diagnostics/*` into `core/diagnostics` (`two-party-check`,
      `found-strand-check`, `handshake-cost`, `loop-lag`), over the host. The
      two-party checks get their second node from `createExtraNode`.
      `apps/mobile/src/host/` implements it with the node construction that
      `two-party-check` does today
- [ ] Move the dev-bridge command set (`strands`, `send`, `arm`, `seen`,
      `invite`, `accept`, `traffic`) into `core/diagnostics`; `apps/mobile`
      only installs it in development builds
- [ ] Rework the `test/stack` harnesses that duplicate app logic
      (`two-party-formation`, `restart-reconverge`, `found-strand`,
      `message-latency`, …) to drive `@chat/core` instead
- [ ] One command that runs a named diagnostic in Node and prints results in the
      same format the app's Diagnostics screen shows

## Phase 9 — `apps/web`

- [ ] Add the `web` target to `design/specs/project.md` (SvelteKit, listed as
      planned) and create `design/stories/web`, `design/specs/web`
- [ ] Scaffold `apps/web` with its own lockfile and `link:` to the packages.
      Vite `resolve.dedupe` lists the core's peer dependencies only; add the
      duplicate-copy build check and the stack-import lint rule
- [ ] Web host: a `NodeHost` over a `CadreNode` built after
      `sereus/packages/reference-app-web/src/lib/cadre-web.ts` (IndexedDB
      block storage, WebSockets + circuit relay + WebRTC), and slots over
      IndexedDB
- [ ] Bind core stores directly as Svelte stores
- [ ] Install the dev bridge, so `test/devices` tools drive the browser
- [ ] Join a strand with `apps/mobile` and converge both ways
- [ ] Cross-runtime diagnostics: the same check on mobile, web and Node

## Phase 10 — Engine probe (decides whether `mobile-ns` is worth building)

- [ ] Build `apps/mobile` against an alternate engine (JSC via
      `@react-native-community/javascriptcore`, or V8 via `react-native-v8` if it
      supports the current RN version)
- [ ] Rerun named RN-only failures and the shared diagnostics on both engines.
      Note that Hermes against V8 is also no-JIT against JIT: a speed difference
      alone is not a defect
- [ ] Record the result here: does each failure follow the engine or not?

## Phase 11 — `apps/mobile-ns` (only if Phase 10 points at the runtime)

- [ ] Add the `mobile-ns` target; its spec folder points at the `mobile` stories
      and specs and records only deviations
- [x] Scaffold from `sereus/packages/reference-app-ns`; host after its
      `cadre-phone.ts`, block storage on SQLite (`db-p2p-storage-ns`) (Phase 7d,
      stage 2)
- [x] NativeScript `Observable` bridge for core stores (each page's view model
      subscribes; no general bridge yet)
- [x] Share the Maestro flows with `apps/mobile`: one driver, a flow per app
      (NativeScript cannot set Android resource ids, so its flow selects by words)
- [x] Rerun the comparison: release builds, GUI test (Phase 7d). The diagnostics
      comparison on release builds is still to do.

## Later — revisit a public API

Not scheduled. Reconsider only once `packages/core` is used by at least two of
our apps without app-specific workarounds. Until then the packages stay private
and nothing here should add publishing.
