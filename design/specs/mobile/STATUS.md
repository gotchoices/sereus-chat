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
- [x] ConnectionsList spec
- [x] ChatInterface spec
- [x] InvitationGenerator spec
- [x] MediaPicker spec
- [x] ProfileSetup spec
- [ ] SearchInterface spec
- [ ] QrScanner spec
- [ ] VideoCallActive spec
- [ ] VoiceCallOverlay spec
- [ ] InvitationAcceptance spec

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

## Stack

Runs against the **published** sereus stack (npmjs), not local clones:
cadre-core 0.8.1 · optimystic 0.14.1 · quereus 4.3.1 · p2p-fret 0.6.0.

Toggle with `apps/mobile/use-stack.sh {local|npm}` (metro.config.js follows
package.json automatically). Note the clones under `ser/` are still on the
0.7.x / quereus 3.x line — `local` and `npm` are **not** the same code until
`ser/pull-stack.sh` is run.

Verified: `tsc --noEmit` clean (5 pre-existing screen-level errors, unrelated),
Metro production bundle succeeds, `gradlew assembleDebug` succeeds.
**Not yet verified on-device / on-emulator** — everything below marked ✅ is
verified by code inspection + build only, unless it says otherwise.

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
- [x] Create local chat strand (`publishStrand` → `addStrand({ founder: true })`)
- [x] `mode` no longer hardcoded to `'bootstrap'` — 0.8 infers it from cohort
      membership, so a strand promotes itself to `networked` when peers attach
- [x] Read/write strand DB end-to-end with zero peers

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
      (`SereusAdapter.createInvitation`). **Throws `No multiaddrs available for
      invitation` until this device has a dialable address** — i.e. you must add
      a node to your cadre before you can invite anyone. Surfaced in the UI.
- [x] Share invitation via QR + deep link (`chat://invite/<encoded>`)
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
- [~] `listStrands()` — iterates `node.getStrands()` (in-memory), not a Control
      DB query; `displayName` is a `'My Notes'` / `Strand <id>` placeholder
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
- [ ] `android/app/src/main/AndroidManifest.xml` has **no `VIEW` intent filter**,
      so `chat://` deep links are not registered despite README's adb instructions
- [ ] `npx jest` fails 6/6 suites: bare `preset: 'react-native'` doesn't transform
      `@react-navigation` (ESM), and the default run sweeps in the Detox `e2e/*` files
- [ ] `InvitationAcceptance.tsx` still imports `useVariant` / `mockMode` and never
      calls the adapter; `QrScanner`'s Open button is a no-op
