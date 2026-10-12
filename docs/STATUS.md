# STATUS: moving to the app-family structure

Checklist for moving from today's single app (`apps/mobile`) to the structure in
[app-family.md](app-family.md). Phases are ordered so that each one leaves the
mobile app working.

## Phase 1 — Workspace root

- [ ] Root `package.json` with Yarn workspaces `apps/*`, `packages/*`, `test/*`
- [ ] Move the Sereus stack `resolutions` from `apps/mobile/package.json` to the root
- [ ] Confirm `apps/mobile` still installs, builds and runs from the workspace
      (Metro `watchFolders` / `nodeModulesPaths` for hoisted packages)
- [ ] Rename the landing site `web/` → `site/` so it is not confused with
      `apps/web`; update `publish.sh` paths and any docs that point at `web/`

## Phase 2 — `packages/core` (pure moves, behavior unchanged)

- [ ] Create `packages/core` (`@chat/core`, `"private": true`, ESM, TypeScript,
      vitest); apps depend on it as `workspace:*`
- [ ] Keep the protocol modules (`schema`, domain types, `invitations`) free of
      imports from the rest of the core (see app-family.md, "Packages are private")
- [ ] Move the platform-free modules as-is: `types.ts`, `errors.ts`,
      `chat-sapp.ts`, `chat-operations.ts`, `inviteLink.ts`, `adapter.ts`,
      `adapters/mock.ts`, `cadre/async.ts`, `theme/colorHash.ts`
- [ ] Build the sApp schema from `design/specs/domain/chat-sapp.qsql` inside the
      core (replaces the Metro `.qsql` transformer for this purpose)
- [ ] `apps/mobile` imports these from `@chat/core`; delete the originals

## Phase 3 — Platform injection

- [ ] Define the `Platform` interface (`kv`, `rawStorage`, `secureStore`,
      `peerKey`, `transports`, `log`)
- [ ] Rework `CadreService` into `core/node`, constructed with a `Platform`; no
      module-level `AsyncStorage` or `rn-leveldb` imports
- [ ] Move to the core over the injected `kv`: `chat-strand.ts`,
      `adapters/sereus.ts`, `strand-prefs.ts`, `strand-summary-cache.ts`,
      `outgoing-invitations.ts`, `data-format.ts`, `cadre/rn-durable-slot.ts`
- [ ] `apps/mobile/src/platform/` implements `Platform` with AsyncStorage,
      `rn-leveldb`, `loadOrCreateRNPeerKey`, WebSockets + circuit relay
- [ ] An in-memory / `classic-level` `Platform` for Node tests
- [ ] Core unit tests pass in Node
- [ ] Re-subscribe to strand discovery inside node start so it survives node
      rebuilds (falls out naturally once lifecycle lives in one place — see
      `apps/mobile/review.md` A3)

## Phase 4 — View-models

- [ ] Store primitive following the Svelte store contract (`subscribe`, `get`)
- [ ] Strand-list view-model: replaces `StrandList` polling, owns sort order and
      the settling / failed / ready states
- [ ] Chat view-model: replaces `ChatInterface` polling, owns paging
- [ ] Invitation view-model: expiry countdown and recheck from `InvitationGenerator`
- [ ] Reachability view-model: replaces `AppNavigator`'s direct
      `cadreService.getRelayReservationState()` poll
- [ ] Cadre manager: `cadre-ui/useCadreManager.ts` becomes a core view-model;
      the RN components stay in the app
- [ ] View-models expose status codes; user-facing text moves to the UI via
      string catalogs
- [ ] `apps/mobile` screens bind through a `useStore` hook
      (`useSyncExternalStore`)

## Phase 5 — `packages/resources`

- [ ] Move the string catalogs (`src/i18n/locales/*`) to `packages/resources/strings`
- [ ] Extract design tokens from `src/theme` into `packages/resources/tokens`
      (data only); `apps/mobile/src/theme` maps them onto RN styles
- [ ] Move the canonical logo vector (`docs/images/logo_3_m.svg`) to
      `packages/resources/brand`; point the icon-generation scripts there

## Phase 6 — Diagnostics and the Node harness

- [ ] Move `src/diagnostics/*` into `core/diagnostics`, platform-injected
      (`two-party-check`, `found-strand-check`, `handshake-cost`, `loop-lag`)
- [ ] Rework the `test/stack` harnesses that duplicate app logic
      (`two-party-formation`, `restart-reconverge`, `found-strand`, …) to drive
      `@chat/core` instead
- [ ] One command that runs a named diagnostic in Node and prints results in the
      same format the app's Diagnostics screen shows

## Phase 7 — `apps/web`

- [ ] Add the `web` target to `design/specs/project.md` (SvelteKit, already
      listed as planned) and create `design/stories/web`, `design/specs/web`
- [ ] Scaffold `apps/web`; `Platform` over IndexedDB, transports WebSockets +
      circuit relay + WebRTC (follow `sereus/packages/reference-app-web`)
- [ ] Bind core view-models directly as Svelte stores
- [ ] Join a strand with `apps/mobile` and converge both ways
- [ ] Cross-runtime diagnostics: the same check on mobile, web and Node

## Phase 8 — Engine probe (decides whether `mobile-ns` is worth building)

- [ ] Build `apps/mobile` against an alternate engine (JSC via
      `@react-native-community/javascriptcore`, or V8 via `react-native-v8` if it
      supports the current RN version)
- [ ] Rerun the open RN-only failures and the shared diagnostics on both engines
- [ ] Record the result here: does each failure follow the engine or not?

## Phase 9 — `apps/mobile-ns` (only if Phase 8 points at the runtime)

- [ ] Add the `mobile-ns` target; its spec folder points at the `mobile` stories
      and specs and records only deviations
- [ ] Scaffold from `sereus/packages/reference-app-ns`; `Platform` over SQLite
      (`db-p2p-storage-ns`)
- [ ] NativeScript `Observable` bridge for core view-models
- [ ] Share the Maestro flows with `apps/mobile` (different app id only)
- [ ] Rerun the comparison diagnostics: mobile vs mobile-ns vs Node

## Later — revisit a public API

Not scheduled. Reconsider only once `packages/core` is used by at least two of
our apps without app-specific workarounds. Until then the packages stay private
and nothing here should add publishing.
