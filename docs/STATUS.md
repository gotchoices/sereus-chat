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
| `data/types.ts` | `core/model/*` | Split by namespace |
| `data/errors.ts` | `core/model` | Becomes `ChatError` kinds |
| `data/adapter.ts` | `core/model` | `DataAdapter` becomes `ChatModel`; backend selection stays in the app |
| `data/adapters/sereus.ts` | `core/sereus/*` | Split by namespace; AsyncStorage use becomes slots; `perf()` timing kept behind the host's logger |
| `data/adapters/mock.ts` | `core/mock` | Fixtures through `FixtureSource` from root `mock/data` |
| `data/chat-operations.ts` | `core/sereus` | SQL over a strand database |
| `data/chat-strand.ts` | `core/sereus/strands` | Attach, re-attach, joins, discovery, self-registration |
| `data/strand-prefs.ts`, `strand-summary-cache.ts`, `outgoing-invitations.ts`, `data-format.ts` | `core/sereus` | Over slots (app-family.md, *Device-local state*) |
| `screens/ChatInterface.tsx` drafts and read cursors | `core/sereus` (`messages`) | Slots `drafts`, `readCursors` |
| `cadre/async.ts` | `core` (util) | Timeouts and helpers |
| `theme/colorHash.ts` | `core/model/members` | Pure derivation |
| `cadre/CadreService.ts` | `apps/mobile/src/host/` | Replaced by `createPhoneNode` (Phase 2); reachability reading moves to `core/sereus/reachability` |
| `cadre/rn-durable-slot.ts` | `apps/mobile/src/host/` | The AsyncStorage `DurableSlot` behind the core's slots |
| `cadre-ui/useCadreManager.ts` | `core/stores` | Cadre-manager store; the RN components stay in the app |
| Screen polling (`StrandList`, `ChatInterface`, `InvitationGenerator`, `AppNavigator` reachability) | `core/stores` | Loader store and screen stores |
| `diagnostics/*` | `core/diagnostics` | Including the dev-bridge commands; the app only installs it |
| `i18n/locales/*` | `packages/resources/strings` | Plus keys for every error kind and status code |
| `theme/*` tokens | `packages/resources/tokens` | Data only; `apps/mobile/src/theme` maps them to RN styles |
| `data/config.ts` | Stays in the app | `USE_SEREUS` is backend selection; `STRAND_REACTIVITY` is node config |
| `data/attachmentDraft.ts`, `mock/VariantContext.tsx`, `ui/*`, `components/*`, `screens/*`, `navigation/*` | Stay in the app | Presentation and screen hand-offs |

## Phase 1 — Workspace root

- [ ] Root `package.json`: Yarn workspaces `packages/*` and `test/*` (not
      `apps/*`)
- [ ] `test/stack` joins the workspace (one Yarn version at the root)
- [ ] Move `apps/mobile/use-stack.sh` to the root as a script that updates the
      stack versions and `resolutions` in every consumer together (the core's
      `peerDependencies`, `apps/mobile`, `test/stack`)
- [ ] Rename the landing site `web/` → `site/` so it is not confused with
      `apps/web`; update `publish.sh`, `server.sh` and the docs that point at
      `web/`; confirm the deployed paths, including `invite/` and `.well-known`,
      do not change
- [ ] Record in `design/specs/project.md` and the root `AGENTS.md` that the
      domain contract is implemented in `packages/core`, and that targets bind
      to core stores rather than generating data code

## Phase 2 — Adopt the cadre-rn kit in `apps/mobile`

Before anything moves, so that `CadreService` is replaced once, not refactored
into the core and then replaced.

- [ ] Build the node with `createPhoneNode` from `@serfab/cadre-rn/phone-node`:
      keychain secure store, `rn-leveldb`, native Noise crypto
      (`/noise-crypto`), and a `configure` that sets the strand filter and
      `strandReactivity`
- [ ] Start the background runner from `@serfab/cadre-rn/lifecycle` over
      `AppState`
- [ ] Drop chat's own polyfill digest copy in favor of the kit's
      (`/polyfills`, `/native-digest`, sereus 1.13+)
- [ ] Persistence names: pass `names` to the kit (`storagePrefix`,
      `nodeLocalDb`, `nodeLocalKvPrefix`, `savedStartKey`) as pinned constants,
      and add a test that fails if any persisted name (kit names and the
      AsyncStorage keys in app-family.md) changes
- [ ] The kit files the party id, peer key and key store differently from
      `CadreService`. Bump `DATA_FORMAT`: testers wipe and re-pair, with no
      migration
- [ ] Re-test `strandReactivity: { enabled: true }` on 1.14 with a long
      backstop poll. Taleus runs it with a 120 s poll; chat turned it off for a
      proof-of-work cost that optimystic 1.12 removed
- [ ] Two-phone check: pair, send both ways, restart each phone, converge

## Phase 3 — `packages/core` skeleton and `protocol`

- [ ] Create `packages/core` (`@chat/core`, `"private": true`, ESM, TypeScript,
      vitest, `tsc` build to `dist/`); stack as `peerDependencies`
- [ ] `apps/mobile` depends on it as `link:../../packages/core`: Metro
      `watchFolders` and `resolver.nodeModulesPaths`, Jest `modulePaths`, and a
      `core:build` script run before Metro and the native builds
- [ ] Schema codegen: a script turns `design/specs/domain/chat-sapp.qsql` into
      a TS module in `core/protocol` (generated on build, never hand-edited).
      `apps/mobile` drops its Metro `.qsql` transformer
- [ ] Move `chat-sapp.ts` (schema, sApp id, config) and `inviteLink.ts` into
      `core/protocol`; `protocol` imports nothing else from the core
- [ ] `apps/mobile` imports them from `@chat/core`; delete the originals

## Phase 4 — `ChatModel` and the mock

- [ ] Define `ChatModel` by namespace in `core/model`, from today's
      `DataAdapter` and `design/specs/domain/ops.md`: `Result<T>`, `ChatError`
      kinds, and the change signals `changes.strands` / `changes.strand(id)`
- [ ] Map today's thrown errors and `explainJoinFailure` texts to error kinds
- [ ] Move the mock into `core/mock`, reading fixtures through `FixtureSource`.
      Fixture JSON moves to root `mock/data`; `apps/mobile` supplies a source of
      static `require`s
- [ ] Contract suite skeleton in `core`, running against the mock

## Phase 5 — The Sereus model over a host

- [ ] Define `ChatHost`, `NodeHost` and the slot names in `core/model`
- [ ] Move `adapters/sereus.ts`, `chat-strand.ts`, `chat-operations.ts`,
      `strand-prefs.ts`, `strand-summary-cache.ts`, `outgoing-invitations.ts`
      and `data-format.ts` into `core/sereus`, over the host. No module-level
      `AsyncStorage`, `rn-leveldb` or `cadreService` imports remain
- [ ] Drafts and read cursors move out of `ChatInterface` into `messages`, over
      slots
- [ ] Strand discovery and re-attach subscribe through `NodeHost.on`, so they
      survive node restarts without re-subscribing
- [ ] `apps/mobile/src/host/`: `NodeHost` is the Phase 2 phone node; slots map
      to the existing AsyncStorage keys through `rn-durable-slot.ts`
- [ ] Node host for tests: cadre-core with `classic-level`, and in-memory slots
- [ ] Contract suite passes against the Sereus model: two nodes on loopback,
      found, invite, join, send both ways, restart one, converge
- [ ] `apps/mobile` runs on the core model; two-phone check as in Phase 2

## Phase 6 — Stores

- [ ] Store primitive (`subscribe`, `get`, stable immutable snapshots,
      reference-counted start and stop)
- [ ] Loader store: `loading`/`ready`/`failed` over `Result<T>`, change-driven,
      debounced, one read at a time, optional backstop poll
- [ ] Strand-list store: replaces `StrandList` polling and its `watchStrand`
      wiring; owns sort order and the settling / failed / ready states
- [ ] Chat store: replaces `ChatInterface` polling; owns paging, the pending
      "Sending…" rows, and the read cursor
- [ ] Invitation store: expiry countdown and recheck from `InvitationGenerator`
- [ ] Reachability store: replaces `AppNavigator`'s 4 s poll of the relay
      reservation state with the node's events
- [ ] Cadre-manager store from `cadre-ui/useCadreManager.ts`
- [ ] Stores expose status codes; user-facing text comes from the string
      catalogs
- [ ] `apps/mobile` screens bind through a `useStore` hook over
      `useSyncExternalStore`; no screen imports the model or the stack
- [ ] Idle check on the phones: `devcall.mjs <dev> traffic 60` shows no more
      traffic than before the move

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
      `found-strand-check`, `handshake-cost`, `loop-lag`), over the host
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
- [ ] Scaffold `apps/web` with its own lockfile and `link:` to the packages
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
