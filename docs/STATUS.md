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
      - Done: leaving a joined strand sticks across restarts (`forgetJoinedStrand`,
        2026-10-20; scenario "a strand Bob left stays left after he restarts").
      - Open: `isManager` is still a placeholder (`isManager: r.Id === me` in
        `sereus/model.ts`), waiting on readable manager rows.
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
      - Since: "a strand Bob left stays left after he restarts" (2026-10-20); the whole
        suite also runs in offline mode with `SCENARIO_ARGS=--offline` (2026-10-29).
        Offline-specific scenarios are on the "Next" list.
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

- [x] **Where the phone's time goes, and what is the phone's fault** (2026-10-14).
      Optimystic 1.14.0 adopted first (one cluster request fewer per two-member write).
      Times through relay.sereus.org, one join plus messages, `test/devices/devtime.mjs`:

      | | join | commit |
      |---|---|---|
      | Node ↔ Node (memory blocks) | 5.6 s (6.5 s on 1.13) | ~0.3 s (~0.43 s on 1.13) |
      | serchat ↔ NS app on emulator 5564 (i9) | 7.7 s | ~0.45 s |
      | serchat ↔ NS app on the S7, before fixes | 28–39 s | — |
      | same, after fixes | 18–25 s | 1.3–1.9 s (S7's own) |

      - **Hardware explains the rest.** On a quiet Mac the emulator is 4.4–5.6× faster
        than the S7 at pure JS (x25519, Ed25519, ChaCha20, SHA-256) and 4.6× at SQLite
        writes (WAL, `synchronous = NORMAL` in effect); the S7 is 2.5–5× slower at joins
        and commits. Network is not it (same 44 ms ping to the relay). Emulator timings
        swing 5–8× with the Mac's load (taleus's emulator shares it): compare only
        quiet-Mac runs. SQLite reads are the one outlier (11×; 4.1 ms per 1 KB read).
      - **Fixed in `apps/mobile-ns` (software costs, not hardware):**
        - The WebSocket and SQLite plugins crossed JS→Java once per BYTE (S7: 144–170
          ms per 16 KB). Bulk copies via yarn patches (`.yarn/patches/`); the WebSocket
          one also sent wrong bytes for a view into a larger buffer. Filed:
          valor-software/nativescript-plugins#26. sqlite 4.x (2026-10-14) is native,
          but `db-p2p-storage-ns` requires `^3.5.0`.
        - Any JS→Java call carrying bytes costs ~0.3–0.5 ms on the S7 (and the
          emulator), so the COUNT of WebSocket messages matters: libp2p sends one per
          chunk (half are ≤16 bytes). Sends in one turn are joined in
          `src/polyfills/chat.ts`: **62% fewer native sends**, joining and idle.
        - `main-event`'s Node variant threw and caught a TypeError on every call (~2%
          of a join): redirected to its browser no-op in `webpack.config.js`.
        - Receive batching (one posted Runnable per batch) is in the WebSocket patch;
          no measurable gain.
        - SQLite opened by full path (`src/db-path.ts`): the node sometimes failed to
          start, by launch timing, for want of an activity.
      - **GUI regression after the fixes** (NS debug build, S7, serchat, public relay):
        PASS; join through the screens 23.4 s, whole run 112 s — against 36.7–42.2 s
        and 166–171 s for this morning's NS *release* builds.
      - **The phone founding and inviting** (S7, NS debug; serchat joins): new strand
        plus invitation 5.0 s (×2); serchat's join 19.4 and 23.6 s; commits 1.4–2.0 s,
        delivery 2.5–4.0 s.
      - **RN release, batching A/B (S7): inconclusive.** Joins 69–111 s, slower than
        the morning's 40–60 s because each GUI run leaves a strand behind and every
        strand keeps costing traffic and CPU (Fret#2). One baseline run's message
        never reached serchat (180 s). Batching stays in `@chat/core/transport`
        (used by mobile-ns); not installed in apps/mobile, whose polyfills are the
        kit's (suggested on sereus#45).
      - **Galaxy S21 Ultra** (NS debug build, Wi-Fi, 87–100 ms ping to the relay against
        44 ms from the Mac and S7; serchat on the Mac). Hardware: JS as fast as the i9
        emulator (x25519 2.7 ms, Ed25519 sign 1.7 ms), SQLite faster (0.5 ms per 1 KB
        write), JS→Java crossings ~12× cheaper than the S7 (0.039 ms). Screen on:
        - new strand + invitation on the S21: 2.2–2.7 s (1.3–1.5 s with the screen off);
        - S21 joins serchat's strand: 7.0–12.3 s, writable 4.8–11.2 s after that;
        - serchat joins the S21's strand: 10.1–11.7 s;
        - commits 0.6–1.4 s (steady ~0.6–0.7 s), delivery 1.0–2.0 s (steady ~1.0–1.25 s).
      - **JNI global references (fixed):** handing Java a fresh ArrayBuffer per call (the
        first versions of both plugin patches) creates a DirectByteBuffer held by a
        global reference until V8 collects it. The S21 aborted after ~15 minutes
        (`global reference table overflow (max=51200)`, 50,604 DirectByteBuffers);
        reproduced with 60,000 `okio.ByteString.of(arrayBuffer)` calls. The patches now
        reuse one direct buffer and one view: no reference per call, and 0.023 ms per send
        on the S21. Corrections posted on valor-software/nativescript-plugins#26,
        Optimystic#38 and sereus#45. The plugin's receive path (heap buffers) is fine.
        Receive batching was dropped from the WebSocket patch (no measured gain).
      - **Stack 2026-10-15: optimystic 1.15.0 + p2p-fret 1.1.0** adopted (fret's idle
        backoff answers Fret#2; core tests 65/65).
      - **Why founding and joining are slow, on bare cadre-core** (`test/stack/formation-cost.mjs`,
        Node, two relay-only parties, blocks in memory). Loopback relay → public relay:
        - `foundStrand` ~200–350 ms → 456–652 ms, mostly CPU (13% `structuredClone` of
          blocks in optimystic db-core; 41 SQL statements per founding, each prepared
          afresh); the founder's own writes 3–5 ms (one member).
        - Joiner: `formStrand` 120 → 190–520 ms; **`addStrand` ~500 ms → 2.35 s**: 16
          sequential sync requests, every block fetched twice (consult, then
          `reconcile-block` re-requests the same revision). Filed: **Optimystic#39**.
        - The joiner's first two writes (~0.5 s and ~1.7 s on the public relay) read
          sereus's own Member/MemberPeer/Manager tables block by block — sereus#47 /
          Optimystic#29. Steady writes afterwards: 47 ms loopback, 245 ms public relay.
      - **Founding ahead of the invitation** (2026-10-15). `invitations.prepare(kind)`
        founds a conversation in the background (and registers the founder) while the
        person is on the invitation screen; the next `create` without a strand takes it.
        At most one per kind, remembered across restarts (slot `preparedStrands`,
        AsyncStorage key `@sereus.chat/preparedStrands`), hidden from the strand list
        until invited into, and reused rather than left behind. The RN invitation screen
        calls it on opening and when the kind changes; the bridge has `prepare`.
        S7 (NS): invitation for a new conversation **4.0–4.7 s → 0.40–0.43 s** (10 s
        of "thinking" between). Core test "a conversation prepared ahead of its
        invitation".
        **A workaround, not a design:** re-evaluate, and likely remove, once founding is
        fast in the stack (sereus#49) — see "Local workarounds to retire" below.
      - Filed: **sereus#49** (let `foundStrand` return after `publishStrand` and bring the
        strand up in the background — 103 ms of a 751 ms founding is the commitment;
        and `resolveCohortSeed` awaits a strand-addr RPC to the relay, which the public
        relay refuses, ~95 ms per founding). Commented on sereus#47 (sereus's own
        never-written tables — ConsumedInvite, CancelledInvite, Revocation, Manager —
        consulted during a joiner's first writes).
      - Filed: gotchoices/Optimystic#38 (move `db-p2p-storage-ns` to sqlite 4.x:
        native threads, native blobs, no activity needed to open).
      - **Idle FRET chatter** (gotchoices/Fret#2): one shared strand costs the S7
        ~66 WebSocket messages a second each way while idle. A local experiment
        (1.5 s → 15 s after 20 passes, both sides) cut it ~65%; measurement posted on
        Fret#2. Not kept.
      - **Every byte between phones flows through the relay**: DCUtR is configured but
        cannot hole-punch WebSockets, and phones listen nowhere.
      - Posted: Fret#2 (measurement), sereus#45 (NativeScript findings and per-chunk
        WebSocket messages, for RN too). libp2p's `sendReset` uses close code 1006,
        which OkHttp and browsers reject — noted, not posted (libp2p).
      - Tools: `test/devices/inspector-hold.mjs` (one held inspector session — the NS
        runtime aborts on the S7 when a session closes), `profile-summary.mjs`,
        `devtime` `PROFILE=` and `ws://` targets; NS debug builds install the dev
        bridge and `__chatDiag` (crypto, bridge and SQLite cost), and the diagnostics
        screen has a Bridge cost button. Maestro's accessibility queries during a busy
        NativeScript start make Android 17 (emulator) report an ANR; the S7 does not.

- [x] **Stack survey 2026-10-16.** Adopted **sereus 1.16.0** (cadre-core, cadre-rn; it
      moves sereus onto optimystic 1.15 / p2p-fret 1.1, which we already ran, and refuses a
      non-positive `dialTimeout`; core 66/66). Held libp2p 3.4.0 / `@libp2p/websockets`
      10.1.23 until sereus moves (no change to one-message-per-chunk).
      - Maintainer (n8allan) decisions, 2026-10-15: **#49** accepted as an opt-in
        `foundStrand(…, { background: true })` → `{ strandRow, founded, ready }`, plus
        skipping a relay after its first strand-addr refusal; **#47** accepted: the founder
        will create empty collections for every declared table (and `Revocation`,
        `ConsumedInvite`, `CancelledInvite`) at founding; **#45** accepted after the
        owner-key work (reference-app-ns gets the `main-event` and SQLite-path fixes; send
        coalescing planned for the RN kit and the NS app); **#46** versioned control-schema
        migrations, typed error first — the owner-key release is expected to need one more
        party recreate (a `DATA_FORMAT` bump here) unless migrations land first; **#48**
        deadline fixes after #47. No reply yet on Optimystic#38/#39 or
        nativescript-plugins#26.
      - Re-tests answered: **Fret#2** (S7, fret 1.1.0: no `neighbors` streams, `ping`
        24 → 6 a minute, WebSocket messages −63% idle; Node shows no backoff resets);
        **sereus#34** (38 strand starts: relay first attempts median 1 ms, max 2.0 s — the
        18 s drive is gone); **Optimystic#29** (a steady write is 3 `cluster` requests on
        open streams, median 286 ms on the public relay, from 0.6–0.9 s).
      - New observations, posted: one attach in three over the public relay takes 10–13 s
        (a 33-block replication push spends ~8 s crossing the relay; two relayed
        connections between the strand nodes; on Optimystic#39). The main idle cost left
        is sereus's **revocation enforcer**: every 30 s per party it re-reads Member,
        MemberPeer and two tree blocks from the other member (4 relayed requests; mentioned
        on Fret#2). Reproduced 2026-10-18 (`IDLE_S=120`, 1 and 3 strands: 8 polls and ~33
        sync requests per strand per 2 min, 83–98% within 2 s of a poll). **Not a new
        issue:** sereus#50 (filed 10-15) already covers the enforcer among an idle cadre's
        timers, counted as local block reads; our data adds that on a strand these reads
        cross the relay to the other member. Commented on sereus#50 (2026-10-18). The
        copy of `formation-cost.mjs` attached to Optimystic#39 predates `IDLE_S` and
        `SHOW_LIMITS`.

- [x] **sereus 1.17.0 + quereus 4.20.3 adopted** (2026-10-19). Held: libp2p 3.5.1
      (sereus still ranges ^3.3.11), sqlite 4.1.0 (Optimystic#38).
      - **Breaking, handled:** owner keys are separate from the machine identity —
        `getIdentityOwnerKey` is gone; genesis is `runOwnerGenesis(node, { keyStore })`
        (`@serfab/cadre-core/edge-node`) in serchat (FileKeyStore owner slot), mobile-ns
        (`LocalKeyStore` over the SQLite `kv` table), the core's test host and diagnostics;
        the RN kit does its own. `ChatHost.ownerKeyStore` (optional) backs
        `cadre.exportOwnerKey`; the status fingerprint reads `getOwnerSigner()`.
        `StrandRow.FounderPeerId` (null on joined rows). Control stores from ≤1.16 are
        refused (`ControlStoreIncompatibleError`): **`DATA_FORMAT` → `sereus-1.17`** in
        serchat and apps/mobile. mobile-ns has no data-format check yet — clear test
        phones' data (`pm clear`) when installing a 1.17 build.
      - **Our issues in 1.17:** #49 background founding shipped (opt-in); #47 empty
        collections at founding shipped; #45 shared edge node (`createEdgeNode`) shipped;
        #48 deadline ladder; #46 schema versions recorded from now on. Not yet:
        Optimystic#39 (double fetch; no optimystic release), sereus#50 (idle pollers).
      - **Measured (Node, public relay):** background founding publishes in 38–45 ms vs
        556–698 ms foreground; join `addStrand` 2.3–2.5 s (unchanged, #39); the joiner's
        first writes no longer hit `no-quorum` (#47) but still fetch the strand tables one
        block at a time (12 and 17 sync requests); steady writes 317 ms median; idle
        24 polls / 102 sync requests per 3 strands per 2 min (unchanged, #50).
      - **S7 (NS):** joins 22.8 / 23.5 s (+~11 s to writable), commits 2.4–4.0 s — no
        better than 1.16. Background founding in the app: invitation ready in 1.9–2.8 s
        (published ~1.1 s, invite published ~0.7–1.5 s) vs prepared 0.47–0.50 s.
      - **Background founding adopted (default, 2026-10-20).** A new conversation for an
        invitation is published, the invitation minted at once, and the strand started in
        the background (`ChatHost.backgroundFounding`, default on; `false` opts out). Two
        things it needs, both in the core: the new strand is **listed at once** as
        connecting ("Waiting for someone to join"), or `tail --all` and the list miss it
        until it opens; and a short-lived host **waits for the start** before stopping
        (`SereusModel.settle()`, awaited in serchat's shutdown), or a one-shot `invite`
        leaves the strand published but not started and a prompt joiner is refused.
        A joiner redeeming before the start finishes is refused retryably (by design).
        serchat scenarios: 2 pass + the expected fail, 7 consecutive runs of the restart
        scenario. Harness: `SCENARIO_ARGS='…'` passes extra serchat options to every run.
      - A first conclusion that background founding left the inviter unreachable was
        WRONG — my driver ran Bob with `spawnSync`, freezing the in-process relay.
        `test/stack/background-founding-double-start.mjs` and `…-restart.mjs` show bare
        cadre-core handles overlapping starts (the watcher offers a background-founded
        strand as `strand:discovered` before `publishStrand` returns, on file storage) and
        restarts fine; kept as checks.
      - S7 (NS): an invitation with nothing prepared is ready in 1.9–2.8 s (was 4.0–4.7 s);
        prepared, 0.47–0.50 s — so the prepared path stays for now.

- [x] **Fixes before internal testing** (2026-10-20).
      - **Leaving a joined conversation sticks:** `leave` now calls cadre's
        `forgetJoinedStrand` for a joined strand (removes the party-wide `JoinedStrand`
        row, with a tombstone) and `unpublishStrand` only for one founded here. serchat's
        "a strand Bob left stays left after he restarts" passes — no `it.fails` left.
      - **A join waits out the inviter's start-up:** with background founding an
        invitation can be redeemed before its strand runs; `acceptInvitation` retries
        `formStrand` on `host-strand-unavailable` / `token-unknown` (token unspent) every
        3 s for up to 60 s, instead of "try again in a moment".
      - **RN owner-key export:** the RN `chatHost` passes `ownerKeyStore` (the kit's
        `SecureStoreKeyStore` over the keychain, default options), so
        `cadre.exportOwnerKey` works again after 1.17.
      - Core 66/66, serchat unit 14/14, scenarios 3/3.
      - **RN release smoke test on sereus 1.17 (S7, 2026-10-20): passes.**
        - Old data is detected and the user told how to clear it (sereus-1.15 → 1.17).
        - First-run setup through the screens (`test/gui/flows/rn-setup.yaml`: name,
          then the relay by `chat://relay?addr=…`; the button needs an anchored
          `^Use this relay$` — the title "Use this relay?" matches too).
        - Owner-key backup shows a key (`rn-owner-backup.yaml`; never asserts on the
          key, dismissed at once).
        - Join and talk against serchat, 2/2 PASS: link → Join 9.7 / 14.7 s; Join →
          conversation 39.9 / 25.2 s; phone → serchat 1.2 / 15.2 s (fresh data; the
          earlier 40–110 s joins had a dozen leftover strands).
        - Making an invitation (`rn-invite.yaml`, `THINK_MS`): tapped after 10 s on the
          screen 4.5 / 5.8 s; after 1 s 8.3 s, and 33.3 s for the first after a cold start.

- [x] **Stack 2026-10-22: sereus 1.18.0, optimystic 1.18.0, p2p-fret 1.2.1** adopted
      (quereus 4.20.3, libp2p 3.3.11 and NS sqlite 3.5.9 unchanged). Answers **sereus#50**
      (pollers woken by table changes, idle cadre sends no `sync`) and **Optimystic#39**
      (closed: one fetch per missing block); partly **sereus#48** (retries back off one
      link round trip) and the control half of **#47** (control tables created at founding).
      Still open: Optimystic#29 (a write is ~4 requests per collection), #38, sereus#47
      (strand side), #48 (deadlines), #49.
      - **No data wipe:** a 1.17 control store migrates in place on 1.18 (sereus#46);
        `DATA_FORMAT` stays `sereus-1.17`.
      - **mobile-ns:** Optimystic 1.18's `IRawStorage` requires `flush`, `whenDurable` and
        `durability`; `LazyNsRawStorage` forwards them and `close`. **Not yet run on a
        phone.** The NS block store now bumps a `durability_mark` row with UPSERT
        (`ON CONFLICT … DO UPDATE`), which Android 8's SQLite rejects — expect the S7 to
        fail there; a newer Android should not.
      - Core 66/66, serchat unit 14/14, scenarios 3/3; all apps type-check.
      - `formation-cost.mjs` (Node, two relay-only parties, 3 strands; now counts the
        streams opened while idle):

        | | 1.17 loopback | 1.18 loopback | earlier, public relay | 1.18 public relay |
        |---|---|---|---|---|
        | `foundStrand` | 0.40–0.45 s | 0.37–0.40 s | 0.46–0.65 s | 0.53–0.75 s |
        | joiner `addStrand` | 0.53–0.71 s | 0.25–0.35 s | 2.35 s; 1 in 3 took 10–13 s | 1.1–1.3 s (9/9) |
        | joiner's first Message | 0.83–0.93 s | 0.34–0.39 s | ~1.7 s | 1.0–1.3 s |
        | steady write, median | 91 ms | 56 ms | 245–286 ms | 251 ms |
        | streams per idle minute | 270 (108 `sync`/`block-transfer`) | 73, none | — | 61, none |

        Idle traffic left is FRET and libp2p pings only. Founding is unchanged; owner
        genesis is ~0.13 s slower (control tables created at founding).
      - **Emulator 5564 (Android 17), public relay, against serchat, 2026-10-22:**
        - RN release: fresh setup (`rn-setup.yaml`) passes; join and talk 2/2 PASS, Join →
          conversation 7.6 / 7.9 s; invitation 0.2–1.1 s after the tap (prepared).
        - NS debug: setup passes; join and talk 2/2 PASS, Join → conversation 6.7 / 5.6 s.
          Optimystic 1.18's NS block store works here (Android 17's SQLite has UPSERT).
      - Release builds now need the signing variables (`app/build.gradle` reads
        `STORE_FILE_CHAT`, `STORE_PASSWORD_CHAT`, `KEY_ALIAS_CHAT`). Test builds use the
        debug key so they install over earlier test builds and keep their data:
        `STORE_FILE_CHAT=debug.keystore STORE_PASSWORD_CHAT=android KEY_ALIAS_CHAT=androiddebugkey`.
      - **S7, public relay, against serchat, 2026-10-23:**
        - **1.17 → 1.18 in place (RN):** installed over 1.17 data, no data-format screen;
          node up 30 s after launch, all six conversations attached at 58 s.
        - **RN join and talk** (fresh data): 3/3 PASS once the phone had Wi-Fi again (the
          first three failures were the phone offline, not the stack). Join → conversation
          48.6 / 32.5 / 22.0 s, against 39.9 / 25.2 s on 1.17: no gain. Of one 20 s attach:
          strand node 1.6 s; serchat's catch-up push (48 blocks) lands at 5.4 s; then
          28 one-block `sync` requests to serchat, ~5 s each in flight; ~25 `cluster`
          requests for the first writes; open at 19.7 s.
        - **RN invitation** (`rn-invite.yaml`): 10 s on screen 5.1 s; 1 s 9.4 / 20.4 s
          (1.17: 4.5–5.8 s and 8.3 s). Founding is unchanged in 1.18, so the
          prepared-conversation workaround stays.
        - **NS (debug):** with fresh data, the reply's commit fails `commit-not-durable`
          (the phone cannot confirm it holds the block). With the one `durability_mark`
          UPSERT in `db-p2p-storage-ns/dist/src/sqlite-sync.js` rewritten as
          `INSERT OR REPLACE … COALESCE((SELECT n …), 0) + 1` (test edit, reverted), 2/2
          PASS: Join → conversation 14.1 / 14.5 s, send ~1.1 s. So Optimystic 1.18's NS store
          needs SQLite ≥ 3.24 (Android 8 has 3.18). Old-phone only: not an upstream issue
          (scope rule); a local yarn patch if the NS app is to keep running on the S7.
      - **Found: pushed blocks are re-checked one by one.** After the join catch-up push
        delivers every block, the joiner's first reads send one `sync` request per block
        to the founder (Node, public relay, `formation-cost.mjs` with
        `DEBUG=optimystic:db-p2p:protocol-client*,optimystic:db-p2p:sync-service*`: 17–20
        per attach over 3 runs, answered during the first write; the S7 sends 28). The
        remaining case of Optimystic#43 (closed in 1.17: a commit received as a cohort
        member counts as checked; a block received by push does not).
        - Confirmed 2026-10-23 with `OVERLAP=1 formation-cost.mjs` (3 runs loopback, 3 public
          relay): pushed 42 blocks; then 22–24 (loopback) / 25–27 (public relay) `consult`
          requests from the joiner to the founder, every one for a block the push had just
          delivered, all within 10 s; none the other way.
        - **Not filed: upstream's documented tradeoff.** The `NOTE` on
          `CoordinatorRepo.noteCohortCommitApplied` (Optimystic v1.18.0) says a pushed replica
          is deliberately not stamped (a push proves the revision was committed once, not that
          nothing newer exists), "revisit if pushes dominate a profile". In `lazy` mode
          (Sereus's) the consults run behind the read, so they cost relayed requests, not a
          blocked read; their effect on join time is not measured. File only with a
          measured join-time gain from stamping pushed blocks (e.g. on the S7).
      - **Optimystic#29 re-measured on 1.18 (2026-10-24, answered).** `message-latency.mjs`
        (brought up to 1.17's owner genesis; `DEBUG` now marks each write), public relay,
        12 writes × 2 runs: every write, from the first, is 3 `cluster` requests to the other
        machine on prepared streams, commit median 243–245 ms (1.15: 286 ms, and a 1.2 s
        2nd write after joining, now gone). The joiner's own post-join traffic (6 `sync` +
        6 `cluster` during the host's first write) overlaps write #1 (394 / 589 ms).
        Said the issue can close from our side; mentioned the pushed-block consults as data
        for the upstream NOTE, not as a request.

- [x] **Stack 2026-10-26: sereus 1.19.0, optimystic 1.19.0** (p2p-fret 1.2.1, quereus
      4.20.3, libp2p 3.3.11, NS sqlite 3.5.9 unchanged). **Every machine must move together:**
      1.19 ↔ 1.18 block pushes deliver nothing, silently (sereus#52), so testers on a 1.18
      APK and a 1.19 APK will not join each other properly. 1.18 stores open without
      migration; `DATA_FORMAT` stays `sereus-1.17`. No chat code changes needed.
      - Core 66/66, serchat unit 14/14, scenarios 3/3; all apps type-check. NS block store
        still uses UPSERT (`durability_mark`), so the NS app still fails on Android 8.
      - **Optimystic#42 fixed** (filed by the Taleus work, not chat; `INDEXES=1 formation-cost.mjs`, new): a one-row insert by
        the joiner costs 3 `cluster` streams to the founder for 0, 1, 2, 3, 4 and 5 indexes
        and for the excluded-row partial index (was 4(k+1); 24 for five).
      - `message-latency.mjs`, public relay: every write 3 `cluster`, commit median 245 ms;
        the joiner's post-join traffic now overlaps only write #1 (8 `sync` + 4 `cluster`),
        not #1–#3. Joiner's Member write 446 ms (1.18: 521).
      - `formation-cost.mjs` loopback (Mac load average 12–24 during these runs, so treat
        timings as rough): `addStrand` 0.23–0.38 s, joiner's first Message 0.17–0.19 s
        (1.18: 0.34–0.39), steady writes median 38 ms (56). Pushed-block consults unchanged
        (24–27 per join; the documented tradeoff). `OVERLAP=1` updated for 1.19's push
        reply (`accepted` ids, no `type`).
      - **sereus#51 (cadre-rn's Hermes `TextDecoder` and `structuredClone` stand-ins, from
        Sereus Health)** reported a write on the S7 going from ~7 s to ~1.5 s. The RN app
        uses the kit's stand-ins, so the S7 should be re-timed on 1.19 when it is free.
      - Closed upstream as shipped (already adopted): sereus#45 (`createEdgeNode`; NS could
        adopt it), #47, #49, #50. Asked of us: Optimystic#38 (test sqlite 4.x with threading
        on our devices; needs a phone). sereus#48 (re-run the phone arm on 1.19) is the
        Taleus work's issue; run here in `ser/sereus-wt-119` (v1.19.0, Optimystic from npm).
        Phone arm, one run (2026-10-26, Mac load 4–8): seated 331.6 s after joining (1.16:
        108–110 s); 8 rounds in 1844 s (1.16: 603–1056 s), **all 8 failed** ("Some peers did
        not complete"); cohort silent 182, stream reset 107, commit retried 39, FRET peer
        marked dead 27 (728 contact strikes), ping failures 135; strand nodes still connected
        afterwards; "converged" 307 s later on the one row that committed (Invoice:r4).
        Loopback control: 8 rounds in 0.8 s, converged at once. Not posted (whose issue).

- [x] **Asynchronous writes: sereus 1.19.1 / optimystic 1.20.1 / quereus 4.21.1, offline mode**
      (2026-10-29; plan and rationale in [async-writes.md](async-writes.md)).
      - **Stack:** pins moved; no data wipe (1.19 stores open on 1.20). Every tester must move
        together. Errors now classified by name: `BlockUnavailableError` and
        `PromiseShortfallError` are `unavailable` (the text patterns missed the first),
        `ValidityRejectedError` is `rejected`, `StrandQueueNotEmptyError` is `unsent-messages`.
      - **Core:** every write returns its transaction id (`returning StampId() as Tx`), and
        `sereus/delivery.ts` follows it: `saving → waiting → sending → here → delivered`, or
        `unconfirmed` / `failed`, from the queue's statuses and the durability reports.
        Persisted (slot `outbox`). Marks reach the stores on their own signal
        (`changes.delivery`, `messages.deliveries`), not by re-reading the list.
        New: `messages.outbox`, `dismissFailure`, `discard`, and
        `strands.leave({ discardUnsent })`.
      - **Schema:** `Message.Id` and `Attachment.Id` are tagged `"optimystic.fresh" = true`, and
        the sApp version is 0.2.0, so an ordinary waiting send is `assured`, not "may not go
        through" (asserted by the core test).
        **Cost found:** a tag-only schema change makes an existing strand fail to open while
        its other member is offline (`PromiseShortfallError`), in both modes:
        `test/stack/schema-change-offline-peer.mjs` (`CHANGE=none` opens in ~100 ms; `CHANGE=tag`
        fails at ~5 s). Seen on the S7: three conversations with gone serchat partners
        dropped out of the list. Filed as **gotchoices/sereus#55** (2026-10-30). Decision:
        keep the tag and live with it, with no app-side workaround and no app-side migration
        code. See "Upstream bugs we live with" below.
      - **serchat:** synchronous by default. `--offline` adds a file journal per strand. A
        one-shot run waits (≤ 60 s) for queues to drain before exiting. New: a `delivery`
        column, `outbox <strand>`, `leave --discard`.
      - **RN:** offline mode by default (`CadreService.sendMode`, key `@sereus.chat/sendMode`).
        Diagnostics has "Wait for the others on every send", which calls the kit's
        `setStrandOfflineMode` and is refused while writes are queued.
        `DurabilityMark` draws the pie, also on your own reaction chips. The conversation
        has a queue line, not-sent banners with Dismiss, and Withdraw on a waiting message.
        StrandDetail asks before leaving with unsent messages.
      - **NativeScript:** no journal upstream, so it stays online. It shows marks from
        durability reports only (no UI built).
      - **Tests:**
        - core 69/69, including `delivery.test.ts` (online and offline, peer gone, leave
          refused);
        - serchat unit 14/14;
        - scenarios 3/3 synchronous and 3/3 with `--offline`;
        - apps type-check;
        - mobile jest: the persisted-names pin passes. 6 suites fail the same way without
          these changes (Detox and keyboard-controller environment).
      - **S7 (RN release, debug-signed, over 1.18 data):**
        - it opens;
        - join and talk with serchat passes: Join → conversation 18.9 s (1.18: 22–48 s),
          phone → serchat 7 s;
        - a send with serchat gone shows the quarter pie and "1 waiting to send · waiting
          for the others · showing saved messages".
      - **A replicated write lost across a quick restart: our bug, fixed.** A node stopped
        within a few seconds of taking the other member's write did not have it after
        restarting, online or offline. Optimystic groups writes in memory and flushes them
        on a timer, and the code that builds a store must close it. serchat's host never
        closed its `FileRawStorage` stores or journals; it now does on stop. So does the core
        test party's journal. The phone kit closes its own. Shown by
        `test/stack/restart-after-replicated-write.mjs`: lost in 12 of 14 runs with the stores left open,
        kept in 6 of 6 with the stores closed. Not filed upstream.

- [x] **Stack 2026-11-02: sereus 1.20.0, optimystic 1.23.0, quereus 4.24.0, p2p-fret 1.3.0**
      (libp2p 3.3.11 unchanged). No chat code change, no data wipe: the new log, journal and
      sync fields are optional, and older data reads.
      - Sereus API changes that chat does not touch:
        - app-schema state `'waiting-for-cohort'`;
        - `strand:app-schema-deferred.waitingFor`;
        - app-schema listeners moved to their own type;
        - `registerSelfUnlessCouldFork()`.
        `describeThrown()` is new and optional, and could improve chat's error text.
      - Optimystic changes chat does not touch: `merge.filterConflict` and `txsig:v3`.
        Phone storage keeps its own read cache, one `LevelDBRawStorage` per scope in the kit;
        check our diagnostics extra node (`src/host/extra-node.ts`).
      - Wins expected on phones: no JS text decoder on stored reads (Optimystic#51), and
        peer-store rewrites at most once a minute (#40). Slow links: fret derives its deadlines
        from `linkRoundTripMs` (7 s instead of 2 s), the sereus#48 diagnosis. Offline mode:
        inserts into indexed tables no longer fail behind queued ones (#50). Reactivity is now
        cheap when idle (#48, #49), which may make `STRAND_REACTIVITY` worth turning on.
      - Native crypto (`setCryptoBackend`, Optimystic 1.21) is still not wired by sereus.
        NativeScript storage still asks for sqlite `^3.5.0`, so our 4.1.0 resolution stays.
      - Core 69/69, serchat unit 14/14, scenarios 3/3 synchronous and 3/3 `--offline`; all
        four apps type-check.
      - **sereus#55 verified fixed and closed** (see "Upstream bugs we live with").
      - Diagnostics extra node and found-strand platform now keep one `LevelDBRawStorage` per
        scope and close them on cleanup (`src/host/extra-node.ts`), as the 1.23 storage
        requires.
      - **Phones, RN release, offline mode, public relay, against serchat** (2026-11-02):

        | | 1.19.1 / 1.20.1 | 1.20.0 / 1.23.0 |
        |---|---|---|
        | S7: Join → conversation | 18.9 s | 17.4, 20.7 s |
        | S7: send tapped → serchat has it | ~7 s | 3.4, 3.4 s |
        | Emulator 5564: Join → conversation | 7.6, 7.9 s | 7.9, 34.3 s (second run slow, Mac load) |
        | Emulator: send → serchat | ~3 s | 4.1, 4.0 s |

        Delivery from the S7 roughly halved, in line with Optimystic#51 and #40. Joins
        unchanged. The NativeScript app was uninstalled from emulator 5564 to make room; it was
        test data only.

- [x] **Offline-mode correctness suite and history scaling, CLI to CLI** (2026-11-02, stack 1.20/1.23).
      - **Suite:** `apps/cli/test/offline.test.ts`, 3/3. serchat gained `edit`, `delete`,
        `react`, a read-only `sql` for diagnostics, and `--drain <s>`. The harness gained
        per-person options (`Person.with`).
        - Both sides write while apart (`--drain 0`), then reconnect: every message arrives
          exactly once, the same order on both sides, converged within one 20 s window.
        - Offline-mode Alice and synchronous Bob work together.
        - Bob deletes a message while Alice, apart, reacts to it: both sides end the same
          and nothing is reported refused, but the reaction **commits dangling** (its message
          is gone) on both. That is Optimystic's documented gap (`docs/offline-sync.md`:
          FOREIGN KEY is not re-judged; backlog
          `feat-offline-sync-constraint-recheck-before-submit`), not a new bug. Chat
          ignores orphan reactions.
        - Running `offline.test.ts` and `scenarios.test.ts` in one vitest run, with the Mac
          at load 11, hung two of the original scenarios before any message. Each file
          passes alone (3/3 and 3/3).
      - **Fixed in chat: same-second messages could show out of order.** `Timestamp` was
          stored to the second and ties broken by the random id. It now keeps milliseconds
          (`storedNow()` in `sereus/operations.ts`; Quereus orders fractional datetimes
          correctly), and the suite asserts send order.
      - **History scaling** (`test/stack/history-scale.mjs`, founder alone, blocks in memory,
        Node): the newest-100 list read costs 21 / 97–107 / 440–463 ms at 100 / 1,000 /
        5,000 messages, the same as `count(*)` (a full scan). An index on `Timestamp`
        changes nothing.
        - Cause (`test/stack/optimystic-insert-scale.mjs` and plan checks): **Optimystic
          tables never use a secondary index for ORDER BY or a range predicate.** The plan is
          SEQ SCAN + SORT or FILTER. A Quereus memory table with the same index uses an
          index scan (ASC, 6 ms) or an index seek (range, 6 ms), against 93 / 55 ms on
          Optimystic at 2,000 rows.
        - **Diagnosis (Optimystic 1.24.0 source, `getBestAccessPlan` in
          `quereus-plugin-optimystic/src/optimystic-module.ts`):** a secondary index is
          considered only once an `=` filter matches its leading column. So an ORDER BY with
          no equality, and any range (`>`, `<`) on an indexed column, never reaches an index.
          That holds even for ascending TEXT, which the plugin's own notes call safe to promise.
          Equality does use the index.
        - Upstream knows **only part**: backlog `debt-optimystic-true-key-ordering` →
          `debt-optimystic-pk-range-seek` covers primary-key ranges and value-order key
          encoding. No ticket covers ordering-only or range access through a secondary index.
        - Repro: `test/stack/index-ordering-plans.mjs` (memory table vs Optimystic, same index,
          plans and times). Our need: at 5,000 messages about 2 s per list read on the S7.
          **Filed as gotchoices/Optimystic#52** (2026-11-02). Live with it until fixed; no
          app-side workaround.
        - Optimystic 1.24.0 (npm 2026-11-02, no GitHub release yet) adds a planner cost hint
          (`costProfile`: `'distributed'` for the network transactor) and needs Quereus 4.24.
          It does not change index choice. Adopt with the next sereus release.
        - Smaller, Quereus: a DESC order is not served by reverse index scan even on memory
          tables (index scan + sort, 65 ms).
        - Single-insert cost is **not** a size effect: it is high for the first writes after
          a bulk load and decays (flat 30–60 ms per insert to 10,000 rows when sampled
          gradually). The profile is block cloning and JSON (`structuredClone` 24%,
          `canonicalJson`, `decodeJson`). Nothing to file.

- [ ] **Next (proposed 2026-10-30).** In order:
  - [x] *(Done 2026-11-02, apart from the refused-write banner, covered in Node, and the dev-only send-mode switch.)* **Phone pass on the S7**, RN on 1.20, offline mode, about an hour.
        - 2026-10-31, done: a waiting message keeps its mark and count across an app restart.
          This found a tracker bug, fixed in `delivery.ts`: a queue that cannot reach its
          cohort alternates `submitting` and `queued`, and the forward-only rule had pinned
          the mark at "sending". The menu on a waiting message showed Edit, Delete and Copy;
          Withdraw appears only when the queue says no attempt can have landed (`inDoubt`
          false). Note that the send-mode switch is on the Diagnostics screen, which is
          `__DEV__` only, so a release build cannot reach it.
        - 2026-11-02 (1.20 / 1.23 release build):
          - **Leaving with unsent messages asks first.** "Messages not sent yet", with Cancel
            and Leave anyway. The body's grammar for a count of one is fixed ("You have unsent
            messages here (n)").
          - **Reaction marks work.** A 👍 made while serchat was gone shows the quarter pie on
            its chip, and the line counts it ("2 waiting to send"). Its ring is red ("may not
            go through"), the stack's verdict for a reaction (composite key, not fresh; a
            foreign key to a message that could be deleted). Decided (user, 2026-11-02):
            reactions show plain "waiting", never the red ring (`MessageBubble` passes
            `mayFail: false` for reaction chips). The core still reports the stack's verdict.
          - Not covered on a phone: a refused write's banner (covered in Node:
            `delivery.test.ts`; the offline scenario's conflict produced a dangling row, not a
            refusal) and the send-mode switch (dev builds only).
        Check:
        - delivery marks survive a restart;
        - a refused write shows its banner, and Dismiss clears it;
        - Withdraw on a waiting message;
        - leaving with unsent messages asks first;
        - the Diagnostics send-mode switch, both ways, refused while writes are queued;
        - reaction marks.
  - [ ] **Time sends on the S7** in both send modes, for sereus#51 (the kit's Hermes
        `TextDecoder`/`structuredClone`, released in 1.19). Compare with the 1.18 numbers.
  - [x] *(Done 2026-11-02: kept; see "Local workarounds to retire".)* **Re-measure the
        prepared-conversation workaround** on this stack (see "Local workarounds to retire").
  - [ ] **One RN run on the S21**: join and invitation times on a current phone.
  - [ ] *(Step 1 done 2026-11-02: built and measured, off by default.)* **The party's private
        strand**, the sereus#24 suggestion: one closed strand per party that nobody is invited
        into, for data that only this person's own machines may see (invitation labels, private
        nicknames, read position). `packages/core/src/protocol/private-sapp.ts` (its own sApp,
        `org.sereus.chat.private`, a `Label` table) and `StrandRuntime.ensurePrivate`.
        - **Recognized by its id**, derived from the party id
          (`strand-` + sha256(sApp id + party id)[0..32]). The control `Strand` row does not say
          which sApp a strand runs, so every machine of the party has to find it some other way.
          The id is predictable to anyone who knows the party id: that exposes its network name,
          not its content.
        - **Never a conversation:** discovery hands it to `ensurePrivate`, never to the chat
          attach. `chatStrands()` leaves it out of the list, storage usage, search and the
          profile-name sync.
        - **Needs `strandFilter: { mode: 'all' }`:** an sApp filter stops it once its sApp is
          known.
        - **The switches:** `ChatHost.privateStrand`, RN `PRIVATE_STRAND` (`data/config.ts`),
          serchat `--private-strand`, test-host `privateStrand`. Core test
          `sereus/private-strand.test.ts`.
        - **S7, RN release, 11 chat strands, offline mode; 5 idle minutes after a 3-minute
          settle:**

          | | Off (4 runs) | On (3 runs) |
          |---|---|---|
          | Last chat strand open | 40.7–44.8 s | 40.7–42.3 s |
          | Idle CPU | 102–141 s | 133–140 s |
          | Received / sent | 274–463 / 221–410 KB | 470–487 / 381–442 KB |
          | Memory (PSS) | 219–234 MB | 231–234 MB |

          No difference above run-to-run noise. Expected: one strand in twelve is ~8%, and the
          noise is wider than that.
        - **Its own timings:** founded in 36 s on the first start, and up 34–35 s after node
          start on every start after that (alongside the chat strands). A label write takes
          38–85 ms, a count read 76–500 ms. It also comes up and takes writes with **no network
          at all** (two runs while the S7 was off Wi-Fi).
        - **Serchat:** founded in 1.2 s, re-attached in 0.2 s, write 51 ms, read 3 ms.
        - **For a real use:** keep a local copy of what it holds. Otherwise labels appear ~45 s
          into a cold start on the S7.
        - **Next:**
          - wire the first use: the invitation's "who is this for?" label (sereus#24);
          - then private nicknames and read position;
          - a second machine of the party, from the CLI, once cadre-core can add one there
            (Phase 7b on the phone);
          - Optimystic#54 applies to its founding too.
  - [x] *(Done 2026-11-02: `apps/cli/test/offline.test.ts`, 3/3; see "Offline-mode correctness suite and history scaling".)* **Offline-mode correctness suite**, as serchat scenarios (`SCENARIO_ARGS=--offline`
        and mixed), doubling as upstream repro material:
        - both sides write while apart, then reconnect: every message arrives exactly once,
          in the same order on both sides;
        - edits, deletes and reactions queued against each other, including a real refusal
          reaching the not-sent path;
        - a restart mid-send;
        - one party offline-mode, the other synchronous;
        - how often delivery reports end `unconfirmed`, and whether `delivered` is ever
          wrong.
  - [x] *(History size done 2026-11-02: Optimystic#52. Strand count and queue drain not measured; low priority.)* **Scaling, CLI to CLI:**
        - message history at 100 / 1,000 / 5,000. The list query sorts by `Timestamp`
          with no index (2.5–4.4 s on the S7), so an index may fix it on our side;
        - strand count from 5 to 30: start-up and idle traffic;
        - queue drain, 50 queued messages over the public relay.
  - [x] **`describeThrown`** (sereus 1.20) replaces `x instanceof Error ? x.message : String(x)`
        in `sereus/errors.ts`, `strands.ts` and `node-code.ts`, so a thrown non-Error (an RN
        WebSocket event) no longer reads `[object Object]` (2026-11-02). Core 69/69.
  - [x] **Strand reactivity: keep it off for now** (2026-11-02, analysis). Push wakes help only a
        machine that stores none of a table's blocks. In a two-party chat strand both machines
        hold every block (strand breadth 4 > 2 machines), so each side's own storage applying
        the other's commit already wakes its `Database.watch`; the scenarios rely on that.
        Enabling it adds a registration renewal per watched table, and our four tables would
        need four. Revisit for groups larger than the storage group (about 4 machines), or a
        party whose phone stores through a drone.
  - [x] *(Adopted with sereus 1.20.0 / optimystic 1.23.0, 2026-11-02.)* **Optimystic 1.21.0** (2026-10-31): standalone and wire-compatible. Its gains are
        cohort-topic reactivity (off in chat, `STRAND_REACTIVITY = false`), batched
        renewals, the partial-index fix (chat has none), and a native crypto backend
        (`setCryptoBackend`) that no sereus package wires yet. **Adopt with the next sereus
        release**, which will likely require it and wire native crypto. Pins are exact, so it
        cannot slip in.

- [ ] **Upstream bugs we live with: check on every stack release, nag until fixed.** No
      app-side workaround for these, by decision. On each release, read the issue and the
      notes, re-run the repro, and remove the entry once it passes.
      - ~~**gotchoices/sereus#55**~~ **fixed in sereus 1.20.0, closed 2026-11-02.** With the
        other member offline, the strand opens on its old schema (`waiting-for-cohort`, after a
        ~5 s failed apply attempt). The change is applied 14.9 s after the member returns, in
        both modes (`CHANGE=tag RETURN=1 [OFFLINE=1] node test/stack/schema-change-offline-peer.mjs`).
      - **gotchoices/Optimystic#52**: a secondary index is used only for equality, never for
        ORDER BY or a range. Chat's message list is a full scan plus sort, so it grows with
        history (about 2 s per read on the S7 at 5,000 messages). Repro:
        `node test/stack/index-ordering-plans.mjs`. Fixed when the Optimystic rows show
        INDEXSCAN or INDEXSEEK. Then check `history-scale.mjs` with an index on `(Timestamp, Id)`.
        Filed 2026-11-02.
      - **gotchoices/Optimystic#54**: a founding cut off by the process exiting before `stop()`
        finishes leaves a pending record on the strand's `optimystic/schema`. Nothing clears it,
        so every later `foundStrand` fails with "exhausted 10 retries" and the strand is lost.
        On a phone that's the app being closed while a conversation (or the private strand) is
        being founded. Found when a serchat one-shot exited mid-founding. serchat now waits for
        that work before stopping, which is ordinary shutdown hygiene, not a workaround. Repro:
        `STOP_AT=app-schema EXIT_AFTER_MS=500 node test/stack/interrupted-founding.mjs`. Fixed
        when that resumes. Filed 2026-11-02.

- [ ] **Local workarounds to retire** as upstream catches up. Each is extra code or
      complexity carried only because of a stack limitation; on each stack release, re-run
      the measurement named and drop the workaround if the stack now does the job.
      - **Founding ahead of the invitation** (`invitations.prepare`, the `preparedStrands`
        slot, the hidden spare in the strand list, the RN invitation screen's call).
        sereus#49 shipped and is adopted (background founding); on the S7 a prepared
        conversation is still ~4–5× faster (0.5 s against 1.9–2.8 s). Re-measure:
        bridge `invite` on a phone, nothing prepared; if a new conversation's invitation
        is fast enough without it (the S7 took 4.0–4.7 s, 0.4 s prepared), remove the
        prepare path, its slot and storage key, and the list filter, and simplify
        `createInvitation` back to founding inline.
        **Re-measured 2026-11-02 (sereus 1.20.0, S7, RN release, offline mode): kept.**
        Prepared, 0.45 / 0.49 / 0.92 s from the tap to the invitation; nothing prepared,
        3.4 / 3.5 / 3.7 s. Unprepared, the time goes to `createOpenInvitation` (~2.4 s),
        which runs while the background start of the new strand holds the JS thread.
        Founding's own publish is ~0.57 s, so the background start is the cost now.
        Measured with a throwaway build: invite steps logged in release, prepare only for
        Private.
      - **NativeScript SQLite 4.x (Optimystic#38): device test done, app moved** (2026-11-01).
        `apps/mobile-ns` now runs `@nativescript-community/sqlite` 4.1.0 through a
        resolution, outside `db-p2p-storage-ns`'s `^3.5.0` peer range. The 3.5.9 yarn patch is
        deleted. On the S7 (Android 8, NativeScript 8.9 over the JNI bridge), with the
        "SQLite 4 check" (`src/sqlite4-check.ts`):
        - the bundled SQLite is 3.50.1, so the block store's UPSERT works on Android 8;
        - 10 of 10 markers survived 5 app kills, both autocommit and synced;
        - reads during a write work, and see the uncommitted rows, as on 3.x;
        - the block store works end to end;
        - the app boots on databases written by 3.x.
        The storage wrapper needed no code change. Results posted on Optimystic#38. Remove the
        resolution once storage-ns accepts 4.x. Maybe retire `src/local-kv.ts` and
        `src/db-path.ts` then: 4.x opens a bare name in the databases folder. Not yet run: a
        long app session on 4.x with network traffic.
      - **NativeScript WebSocket patch** (`apps/mobile-ns/.yarn/patches/@valor-nativescript-websockets-*`).
        Waits on valor-software/nativescript-plugins#26. Remove when a release copies in
        bulk without a JNI reference per send. No upstream reply since filing (2026-10-15),
        and the repository is updated a few times a year: expect to keep the patch.
      - **NativeScript `TextDecoder` view fix** (`apps/mobile-ns/src/polyfills/chat.ts`).
        NativeScript#9941 was fixed by PR #11578 (merged 2026-10-28), shipped only in
        `@nativescript/core` 9.1.4-next and 9.2.0-alpha as of 2026-11-01. The app is on
        ~8.9.9. The polyfill checks the runtime's decoder at start-up and installs itself only
        when the decoder ignores a view's offset, so it goes quiet once the fix arrives. Delete
        the code then.
      - **`main-event` browser rewrite** (`apps/mobile-ns/webpack.config.js`). Remove if
        reference-app-ns / a shared NativeScript bring-up (sereus#45) applies packages'
        `browser` maps.
      - **WebSocket send batching** (`@chat/core/transport`, installed by mobile-ns). Keep
        unless `@libp2p/websockets` or the sereus kit batches sends itself (sereus#45).
      - **Opening an invitation link waits for the node** (`startedNode` in
        `sereus/model.ts`) is a correctness fix, not a workaround: keep.

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

- [x] **Answered by the NativeScript twin instead** (Phase 7d, 2026-10-13/14), not by
      rebuilding `apps/mobile` on another engine. Pure-JS crypto is 2.6–42× faster on V8.
      Release builds end to end are only ~15–20% faster, because a join mostly waits on the
      network and the other side. No failure followed the engine. Details: "NativeScript V8
      probe" and "RN (Hermes) against NativeScript (V8)" above.
  - [x] ~~Build `apps/mobile` against an alternate engine (JSC or `react-native-v8`)~~
  - [x] ~~Rerun named RN-only failures and the shared diagnostics on both engines~~
  - [x] Record the result here: does each failure follow the engine or not? (No: see above.)

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
