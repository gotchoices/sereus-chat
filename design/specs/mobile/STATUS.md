# Target STATUS: mobile

## Bootstrap / Discovery (shared)
- [x] `design/specs/project.md` complete

## Story Generation (mobile)
- [x] Stories exist under `design/stories/mobile/`
- [x] Stories reviewed and STATUS trimmed

## Navigation Planning (mobile)
- [x] `design/specs/mobile/navigation.md` exists and reviewed
- [x] `design/specs/mobile/screens/index.md` lists intended screens

## Domain Contract (shared)
- [x] `design/specs/domain/overview.md` — terminology and data ownership
- [x] `design/specs/domain/schema.md` — local profile + per-strand chat sApp schema (sereus-owned data excluded)
- [x] `design/specs/domain/ops.md` — domain operations
- [x] `design/specs/domain/interfaces.md` — operation→sereus mapping, configuration axes, RN platform gate
- [x] `design/specs/domain/sereus.md` — integration boundary, cadre lifecycle, cadre-vs-chat code split, pending decisions
- [ ] `design/specs/domain/rules.md` — validation, permissions (as needed)

## Screen/Component Slicing (mobile)

### Chat surface

Legend: spec = human screen spec exists · cons = generated consolidation exists ·
code = app code exists.

- [x] ConnectionsList — spec ✓ cons ✓ code ✓
- [x] ChatInterface — spec ✓ cons ✓ code ✓
- [x] InvitationGenerator — spec ✓ cons ✓ code ✓
- [x] MediaPicker — spec ✓ cons ✓ code ✓
- [x] ProfileSetup — spec ✓ cons ✓ code ✓
- [ ] SearchInterface spec — cons ✓ code ✓ but **no human spec** (inverted lane)
- [ ] QrScanner spec — code ✓ (stub) but **no spec, no consolidation**
- [ ] InvitationAcceptance spec — code ✓ (stub) but **no spec, no consolidation**
- [ ] VideoCallActive spec — **index-only: no spec, no consolidation, no code**
- [ ] VoiceCallOverlay spec — **index-only: no spec, no consolidation, no code**
- [ ] Alerts — orphan: code ✓ + routed, but **no story/spec/consolidation and not in
      `screens/index.md`** (it realises the "notifications queue" future story)

### Cadre surface (target for upstream extraction as `@sereus/cadre-rn-ui`)

The screen itself is component-provided; only the integration touch-points
live in chat's app specs.

- [x] CadreManager component lives under `apps/mobile/src/cadre-ui/`, with
      its own `SPEC.md` (layout, sections, JIT key, add-node sheet, exclusions)
- [x] Chat integration: `navigation.md` route + "Manage devices" row in
      `screens/profile-setup.md`
- [x] AddGuest is **not** part of the component — chat uses its own invitation
      flow (`InvitationGenerator` / `InvitationAcceptance`); other apps may
      add their own equivalent on the same page

Note: `src/cadre/CadreService.ts` still imports `CHAT_SAPP_ID` from the data
layer (for `strandFilter`). That single chat→cadre coupling must become a
`configure({ sAppId })` call before extraction.

## Scenario / Peer Review (optional)
- [ ] Scenario docs/images under `design/generated/mobile/`

## Design System (`src/theme/`, `src/components/`)

Driven by `global/ui.md` (semantic tokens, light+dark) and
`components/index.md` (shared component layer).

- [x] `src/theme/` — token-based `ThemeProvider` (system/light/dark, persisted),
      `typography`/`spacing`/`radius` scales, name→color avatar hash
- [x] `src/components/` — Avatar, ListRow, MessageBubble, Badge, EmptyState,
      Banner, IconButton, SectionHeader
- [x] All 9 chat screens converted to tokens + shared components; themed
      navigator headers; CadreManager fed the app palette
- [x] Dark mode works end-to-end (verified on emulator, both schemes)
- [ ] Sign an image asset / brand mark (empty states + headers use Ionicons only)

## Stack

Runs against the **published** sereus stack (npmjs), not local clones:
cadre-core 0.8.1 · optimystic 0.14.1 · quereus 4.3.1 · p2p-fret 0.6.0.

Toggle with `apps/mobile/use-stack.sh {local|npm}` (metro.config.js follows
package.json automatically). Note the clones under `ser/` are still on the
0.7.x / quereus 3.x line — `local` and `npm` are **not** the same code until
`ser/pull-stack.sh` is run.

Verified: `tsc --noEmit` clean (3 pre-existing screen-level errors in
QrScanner/MediaPicker, unrelated — vision-camera / picker types); Metro
production bundle succeeds; `gradlew assembleDebug` succeeds; **app boots,
themes, and navigates on the Android emulator** (live sereus mode).

## Boot & control-network behaviour on 0.8.1 (READ THIS)

**cadre-core 0.8.1 is not designed to run a fully solo phone.** The control DB
registers optimystic with `default_transactor: 'network'`, so *every* control-DB
read blocks until a cohort answers — and a solo phone has none. Confirmed on
emulator: `hasAuthorityKey()` (authority genesis) and `queryCadrePeers()`
(reached from `addStrand` → `launchStrand` → `resolveCohortSeed`, even in
`mode: 'bootstrap'`) both hang indefinitely with no reachable peer. The 0.7
clone the app was first built against did **not** read the cohort in `addStrand`,
which is why solo used to work.

Mitigation in place (so the app boots + stays responsive solo):
- [x] Authority genesis + formation responder run **backgrounded + time-boxed**
      (`CadreService.armCadreServicesInBackground`, `src/cadre/async.ts`), off
      the boot path — `doStart` resolves as soon as the node is up.
- [x] `createChatStrand` attaches the strand **first** (bootstrap mode),
      time-boxes `addStrand`, publishes best-effort in the background.
- [x] `listStrands`/`searchStrands` never block on the attach; an in-flight
      guard collapses the concurrent boot+list calls.
- [x] `createInvitation` checks the `getMultiaddrs()` precondition up front →
      instant, actionable message instead of a hang.

The real remedy is to give the phone a reachable peer (relay/drone) so the
control network forms — see **Transports** below. Solo note-taking ("My Notes")
does NOT persist across the control layer on 0.8.1 without a cohort.

## Final Wiring

### Data Adapter Architecture
- [x] Adapter interface defined (`src/data/adapter.ts`)
- [x] MockAdapter implemented with variant support
- [x] QuereusAdapter stub created
- [x] Screens refactored to use adapter (no variant params)
- [ ] Adapter modes aligned with `interfaces.md` configuration axes (source / profile / storage / filter / bootstrap) — current `BackendMode` enum is obsolete

### Cadre Layer (target: `src/cadre/`, future `@sereus/cadre-rn-ui` UI bundle)

Must compile against `@sereus/cadre-core` with no chat-specific imports. Must support every cadre/strand option sereus exposes (open and closed strands, any node type, any count).

#### Foundation
- [x] CadreService singleton wrapping `CadreNode` (`src/cadre/CadreService.ts`)
- [x] Peer identity persistence (Ed25519 via `loadOrCreateRNPeerKey`, control LevelDB)
- [x] Party ID auto-generation + persistence (AsyncStorage)
- [x] RN polyfills + Metro config (audited against `reference-app-rn` @ v0.8.1)
- [x] Storage provider wiring (LevelDB-RN per strand, including `'control'`)
- [x] `requireSignedSchemas: false` — 0.8 verifies sApp schema signatures
      fail-closed; our sApp config is unsigned, so every `addStrand()` would
      throw `SchemaVerificationError` without this
- [ ] Migrate identity to a `KeyStore` (0.8's model; needs `react-native-keychain`
      adapter + `migrateLegacyIdentity` before `new CadreNode()`, or the device
      silently loses its PeerId). We still use the supported `privateKey` path.

#### Solo phase (no networking)
- [x] Start CadreNode in transaction profile, solo mode
- [x] Create local chat strand — `addStrand({ mode: 'bootstrap', founder: true })`
      **first**, then best-effort background `publishStrand` (reversed vs the
      reference, which publishes first; chat is offline-first — see chat-sapp.ts)
- [x] `mode: 'bootstrap'` is pinned deliberately — omitting it makes 0.8 infer
      the mode from cohort membership, which reads `CadrePeer` and **hangs solo**
      (see "Boot & control-network behaviour" above). Restart in `networked`
      mode once a cohort exists is a future step.
- [~] Read/write strand DB end-to-end with zero peers — works locally in
      bootstrap mode, but the strand only attaches once `addStrand`'s control
      read returns (needs a cohort); solo it times out and the default strand
      does not attach.

#### Transports / connectivity + drone enrolment

Reference ships `[webSockets(), circuitRelayTransport(), webRTC({ iceServers })]`
with `listenAddrs: []`. Progress:

- [x] `circuitRelayTransport()` — added to `CadreService` transports. Lets a
      non-listening phone request a `/p2p-circuit` reservation on a relay/drone
      so `getMultiaddrs()` becomes non-empty (unblocks invite + self-register).
      The predicted `@libp2p/peer-collections` brand skew was just a nominal
      type mismatch — bridged with `as unknown as` (runtime-safe; libp2p matches
      by `transportSymbol`), no `resolutions:` pin needed. Verified: app boots
      with the transport, no regression.
- [x] **Inbound enrolment** — `CadreService.applySeedFromCode` (`decodeSeed` +
      `applySeed` with `pinnedKeyTrustPolicy([seed.signerKey])` for
      trust-on-paste) + a "Join with a seed" action in CadreManager's Add-node
      sheet (`SeedApplyModal`). Verified reachable on emulator. **This is the
      path to test a drone:** bring the drone up, it prints a seed, paste it here
      → the phone dials the drone, gains a cohort, and control-DB reads unblock.
- [x] `useCadreManager` control-DB reads (`AuthorityKey`/`CadrePeer`) are
      time-boxed so "My Devices" renders immediately solo instead of spinning.
- [ ] `webRTC({ rtcConfiguration: { iceServers } })` — relayed→direct hole-punch
      (phone↔phone NAT traversal). Needs `react-native-webrtc` (native dep →
      native rebuild) + `@libp2p/webrtc@6.0.14` + a `polyfills/webrtc`
      `registerGlobals()` import before the libp2p graph + the `@libp2p/webrtc`
      browser-field rewrite in metro. **Not needed for a phone↔drone test**
      (the drone is reached over `wss` + relay); required for phone↔phone.
- [ ] ICE config loader (reference `loadIceConfig()`; `[]` acceptable to start)
- [ ] Optional: `controlNetwork.bootstrapNodes` config (an alternative to the
      seed path for pointing the phone at a known drone address).

#### First remote node
- [x] Authority genesis — **single-key model**: the authority key *is* the node
      identity (`getIdentityAuthorityKey` → `ensureAuthorityKey` →
      `initializeSeedBootstrap`). Runs idempotently on every start.
      This replaced a 0.7-era separate random keypair, which 0.8 would never
      have signed with (`getSelfSigningKey` requires pubkey == PeerId).
- [ ] Register self in `CadreControl.CadrePeer` — blocked twice over: upstream
      `registerSelf()` needs an authority, *and* RN sets `listenAddrs: []` so
      `getMultiaddrs()` is empty and upstream bails. Add to upstream report.
- [~] Add drone via `createSeed()` → deliver → dial — seed is generated and
      displayed for manual paste into cadre-cli; **delivery + `dialInvite` do
      not exist on the phone side** (see `tmp/cadre/README.md`)
- [ ] Add server-then-phone via QR/link → dial (Alert stub)
- [ ] CadreConnections / AddNode screens (AddNode is an Alert action sheet)

#### First partner (strand formation)
- [x] Formation responder installed with `ControlFormationUsageRecorder` —
      **security gate**: `createOpenInvitation`/`formStrand` otherwise lazily
      spin up a solicitation service with no recorder, which accepts every token
- [x] Generate `OpenInvitation` for a chat strand — `createOpenInvitation` +
      `publishFormationInvite({ strandId })` + `encodeInvitation`
      (`SereusAdapter.createInvitation`). Checks the `getMultiaddrs()`
      precondition first and fails **instantly** with an actionable message
      ("add a node to your cadre…") — verified on emulator. Will actually mint an
      invite once Transports gives the phone a dialable address.
- [x] Share invitation via QR + deep link — App Link / Universal Link
      `https://chat.sereus.org/invite/<encoded>` (`chat://` fallback), registered
      + verified routing on device (see Screen conformance gaps → Invite loop)
- [ ] Accept incoming invitation: `formStrand(invitation, disclosure)` then
      `addStrand` using **`FormStrandResult.memberPrivateKey`** (NOT
      `invitePrivateKey` — that one cannot authorize reads). Needs a reachable
      host, so it is inherently a two-device flow.
- [ ] Cross-party strand appears in Control DB on both sides, joined automatically
      (needs a `strand:discovered` handler that refuses to auto-attach `Type: 'c'`)
- [ ] AddGuest / InvitationAcceptance / QrScanner screens wired

#### Key flows
- [x] Authority key creation (idempotent, at startup; also JIT before drone seed)
- [x] Export authority private key for backup (derived from node identity, never
      copied to AsyncStorage — the old code stored it in plaintext there)
- [ ] ~~External key import (JWK file or QR)~~ — **not possible** under 0.8's
      single-key model; a foreign authority key can never be signed with.
      Recovery = restore the node identity key, or enrol via seed.
      `KeyImportModal` currently surfaces that as an error; give it a real UI.
- [ ] Dongle (future — UI placeholder only)

### Chat sApp Wiring

Imports the cadre layer; must not import sereus internals directly.

- [x] Build chat sApp schema string from `domain/schema.md` (Member, Message, Attachment)
- [x] Self-register in `App.Member` on strand attach
- [~] `listStrands()` — iterates `node.getStrands()` (in-memory, non-blocking),
      not a Control DB query; `displayName` is a `'My Notes'` / `Strand <id>`
      placeholder; `unreadCount` hardcoded to 0 (so the unread Badge and
      "Unread first" sort are dead against the live adapter)
- [~] `listMessages(strandId)` — **`strandId` is ignored**; always reads the
      default strand. Single-strand by construction. Cheapest high-value fix.
- [x] `searchStrands(query)` via iteration over attached strand DBs (message text only)
- [x] Send message (insert into `App.Message` with optimistic UI append)
- [ ] Attachments — `App.Attachment` is specified but **no code touches it**;
      `MediaPicker` picks files and drops them. Blob storage undecided.
- [~] Polling loop (~2s) — `ChatInterface` only; `ConnectionsList` / `CadreManager`
      load once
- [ ] Sign the sApp schema (requires `SAppConfig.id` to become an ed25519 author
      key, not the reverse-DNS name) so `requireSignedSchemas` can go back to `true`

### Build Configuration
- [~] `source = mock | live` — a hardcoded `const USE_SEREUS = true` in
      `src/data/config.ts`, not a build flag, and it defaults to **live**
      (spec says mock for dev). Switch point itself is clean.
- [x] Live config: `profile = transaction`, storage = LevelDB-RN, strandFilter = `sAppId = 'org.sereus.chat'`
- [ ] Switch tested without code changes (flipping `USE_SEREUS` *is* a code change)

### Error Handling & Edge Cases
- [ ] Cadre not connected → Settings banner with retry
- [ ] Strand not ready (`status !== 'started'`) → per-strand loading, auto-recover
- [ ] Cohort offline → inline banner; writes stay local until cohort returns
- [x] Invitation cannot be minted → friendly message + retry on `InvitationGenerator`
- [ ] Invitation invalid / expired → friendly message on acceptance screen
- [ ] Conflict resolution for concurrent edits (relies on Optimystic semantics)

### Known defects (not stack-related)
- [x] Deep links registered — `AndroidManifest.xml` now has App-Link + `chat://`
      `VIEW` intent-filters; iOS Info.plist/entitlements/AppDelegate wired.
- [ ] `npx jest` fails 6/6 suites: bare `preset: 'react-native'` doesn't transform
      `@react-navigation` (ESM), and the default run sweeps in the Detox `e2e/*` files
- [ ] `InvitationAcceptance.tsx` still imports `useVariant` / `mockMode` and never
      calls the adapter

## Screen conformance gaps (code vs human spec)

### Invite loop — deep-link scheme fixed; accept logic still pending
- [x] Link shape unified in `src/data/inviteLink.ts` — one source of truth.
      Primary form is the App Link / Universal Link
      `https://chat.sereus.org/invite/<token>`; `chat://invite/<token>` kept as an
      app-installed fallback. Generator emits it; scanner parses either form.
- [x] `QrScanner` scheme mismatch fixed (was `sereus://`) and the "Open" button
      now routes to `InvitationAcceptance` with the parsed token.
- [x] OS deep-link registration: Android App-Link + `chat://` intent-filters
      (`AndroidManifest.xml`, `autoVerify`); iOS `CFBundleURLTypes` +
      `mobile.entitlements` (`applinks:chat.sereus.org`) + `AppDelegate` handlers.
      **Verified on emulator:** `chat://invite/<token>` cold-launches → Accept
      Invite screen with the token.
- [x] Web site + association files live in `web/` (chat repo root, modelled on
      `ser/health/web`): `index.html`, `invite.html`, `.well-known/{assetlinks.json,
      apple-app-site-association}`, `publish.sh` → `chat.sereus.org`.
- [ ] Deploy `web/` to `chat.sereus.org` (`./web/publish.sh`) and fill the release
      SHA-256 + Apple Team ID placeholders so the `https` links verify.
- [ ] iOS: add the Associated Domains capability to the Xcode target so
      `mobile.entitlements` is compiled in (one manual step; see the well-known README).
- [ ] `InvitationAcceptance` Join still just navigates home — the actual accept
      (`formStrand(invitation, disclosure)` → attach with
      `FormStrandResult.memberPrivateKey`) is unimplemented; `SereusAdapter.acceptInvitation`
      is still a `notImplemented()` stub. Needs a reachable host (two-device).

### Attachments / media (blocker cluster)
- [ ] Attachments are picked (`MediaPicker` → `attachmentDraft`) and rendered as a
      chip, but `onSend` sends text only — nothing writes `App.Attachment`
- [ ] `ProfileSetup` avatar edit is a no-op: avatar hardcoded `uri={null}`,
      `saveProfile` omits `avatarUri`, pending pick never consumed here
- [ ] `MediaPicker` Location option is inert as a route (no `onPick` passed); no
      permission-denied state (`react-native-permissions` unused)

### Notable
- [ ] Edit/Delete are local-state only and the 2s poll reverts them (no adapter
      update/delete op)
- [ ] In-strand search: header search button has an empty handler
- [ ] Voice/video call buttons + mic recording are toasts ("not implemented")
- [ ] `ProfileSetup` has no discard-changes confirmation on back
- [ ] `ConnectionsList` sort is a cycling button, not the spec's overlay menu
- [ ] `InvitationGenerator` share omits the QR image (`toDataURL` not called)

## Consolidation drift (regenerate to match code)

The generated consolidations under `design/generated/mobile/screens/` describe
intent that predates `data/types.ts` settling; regenerate to realign:
- [ ] `ChatInterface.md` — claims `inverted` FlatList (not used) and `senderId`
      (type field is `sender`); "media via callback/context" is actually
      `attachmentDraft`
- [ ] `ConnectionsList.md` — nested `partner` shape (type is flat) and
      AsyncStorage sort-persistence (not implemented)
- [ ] `ProfileSetup.md` — lists a DiscardDialog that doesn't exist
- [ ] `MediaPicker.md` — cites `react-native-permissions` / ErrorNotice (absent)
- [ ] `InvitationGenerator.md` — claims QR-PNG share attachment (absent)
- [ ] `SearchInterface.md` — stale `SearchResult` shape + "highlight matches"
      (screen consumes `StrandSummary`, no highlight); also has no human spec

## Cadre vs. sereus reference (v0.8.1) — remaining gaps

- [ ] **Transports** (see above) — the dominant gap
- [ ] Identity on the legacy plaintext `privateKey` path, not a secure-enclave
      `KeyStore`; a future KeyStore switch without `migrateLegacyIdentity`
      silently orphans the device identity + authority key
- [ ] No inbound seed/enrolment path (`decodeSeed`/`applySeed`/`dialInvite`) — the
      phone can be its own founding authority but cannot join an existing cadre
- [ ] No closed strands (`generateStrandMemberKey`, `publishStrand('c')`), no
      `strand:discovered` handler (so discovered strands never auto-attach; must
      refuse to auto-attach `Type: 'c'`)
- [ ] `acceptInvitation` must use `FormStrandResult.memberPrivateKey`, NOT
      `invitePrivateKey`
- [ ] No push-wake / device-token registration / background lifecycle
      (`registerDeviceToken`, AppState hibernate-on-background, cold-start on
      resume) — a suspended phone can't be woken on strand activity
- [ ] `registerSelf()` never writes a `CadrePeer` row (root cause = empty
      `getMultiaddrs()`, i.e. Transports)

## Tracking note

This file (`design/specs/mobile/STATUS.md`) is the **canonical** status source.
The other trackers are inconsistent and should not be trusted alone:
`stories/STATUS.md` overclaims (marks Video Call "Completed" though it's absent);
`appeus/scripts/check-stale.sh` / `status.json` are mtime-only — they never read
`depHashes`, are blind to missing consolidations and stub code, and mis-flag
`CadreManager` (path-relocated) and `Alerts` (orphan). `outputs.json` has uniform
incomplete `dependsOn` and empty `depHashes` for 5 routes. Worth fixing the
staleness script to read consolidations + hashes so the machine view matches.
