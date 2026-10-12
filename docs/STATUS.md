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

## Phase 6 — Stores (6a–6e done 2026-10-12; 6f open)

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
- [ ] **6f. Cadre manager**, on sereus 1.14's claiming model (the one health
      uses). Code done; the device check is still to do.
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
  - Core: 47 tests, including the stores against the mock (pending and
    failed sends, strand-list contents, mute ranking).
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

## Phase 7 — `packages/resources`

- [ ] Move the string catalogs (`src/i18n/locales/*`) to
      `packages/resources/strings`; add keys for every error kind and status
      code the core emits
- [ ] Extract design tokens from `src/theme` into `packages/resources/tokens`
      (data only); `apps/mobile/src/theme` maps them onto RN styles
- [ ] Move the canonical logo vector (`docs/images/logo_3_m.svg`) to
      `packages/resources/brand`; point the icon-generation scripts there

## Phase 8 — Diagnostics and the Node harness

- [ ] Move `src/diagnostics/*` into `core/diagnostics` (`two-party-check`,
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
- [ ] Scaffold from `sereus/packages/reference-app-ns`; host after its
      `cadre-phone.ts`, block storage on SQLite (`db-p2p-storage-ns`)
- [ ] NativeScript `Observable` bridge for core stores
- [ ] Share the Maestro flows with `apps/mobile` (different app id only)
- [ ] Rerun the comparison diagnostics: mobile vs mobile-ns vs Node

## Later — revisit a public API

Not scheduled. Reconsider only once `packages/core` is used by at least two of
our apps without app-specific workarounds. Until then the packages stay private
and nothing here should add publishing.
