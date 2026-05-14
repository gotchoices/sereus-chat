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

- [ ] CadreManager component lives under `apps/mobile/src/cadre-ui/`, with
      its own `SPEC.md` (layout, sections, JIT key, add-node sheet, exclusions)
- [ ] Chat integration: `navigation.md` route + "Manage devices" row in
      `screens/profile-setup.md`
- [ ] AddGuest is **not** part of the component — chat uses its own invitation
      flow (`InvitationGenerator` / `InvitationAcceptance`); other apps may
      add their own equivalent on the same page

## Scenario / Peer Review (optional)
- [ ] Scenario docs/images under `design/generated/mobile/`

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
- [ ] CadreService singleton wrapping `CadreNode` (model on `ser/health/apps/mobile/src/services/CadreService.ts`)
- [ ] Peer identity persistence (Ed25519, MMKV / LevelDB-RN)
- [ ] Party ID auto-generation + persistence
- [ ] RN polyfills + Metro config (mirror `sereus/packages/reference-app-rn`)
- [ ] Storage provider wiring (LevelDB-RN per strand, including `'control'`)

#### Solo phase (no networking)
- [ ] Start CadreNode in transaction profile, solo mode
- [ ] Create local chat strand via `addStrand({ mode: 'bootstrap', strandRow, sAppConfig })`
- [ ] Read/write strand DB end-to-end with zero peers

#### First remote node
- [ ] Authority key generation (vault storage; Keychain/Keystore)
- [ ] Register self in `CadreControl.CadrePeer`
- [ ] Add drone via `createSeed()` → deliver → dial
- [ ] Add server-then-phone via QR/link → dial
- [ ] Restart strand in networked mode (vs bootstrap) when first peer attached
- [ ] CadreConnections / AddNode screens wired to live control DB

#### First partner (strand formation)
- [ ] Generate `OpenInvitation` for a chat strand (sAppId = `org.sereus.chat`)
- [ ] Share invitation via QR + deep link
- [ ] Accept incoming invitation: `formStrand(token, disclosure)` → `registerMember(...)`
- [ ] Cross-party strand appears in Control DB on both sides, joined automatically
- [ ] AddGuest / InvitationAcceptance / QrScanner screens wired

#### Key flows
- [ ] Authority key creation (auto on first remote-node add)
- [ ] External key import (JWK file or QR)
- [ ] Dongle (future — UI placeholder only)

### Chat sApp Wiring

Imports the cadre layer; must not import sereus internals directly.

- [ ] Build chat sApp schema string from `domain/schema.md` (Member, Message, Attachment)
- [ ] Self-register in `App.Member` on strand attach
- [ ] `listStrands()` via Control DB query + per-strand metadata
- [ ] `listMessages(strandId)` via `StrandInstance.database`
- [ ] `searchStrands(query)` via iteration over attached strand DBs
- [ ] Send message (insert into `App.Message` with optimistic UI append)
- [ ] Attachments (insert into `App.Attachment`, blob storage TBD)
- [ ] Polling loop (~2s) until sereus exposes change subscriptions

### Build Configuration
- [ ] `source = mock | live` build flag (default mock for dev, live for release)
- [ ] Live config: `profile = transaction`, storage = LevelDB-RN, strandFilter = `sAppId = 'org.sereus.chat'`
- [ ] Switch tested without code changes

### Error Handling & Edge Cases
- [ ] Cadre not connected → Settings banner with retry
- [ ] Strand not ready (`status !== 'started'`) → per-strand loading, auto-recover
- [ ] Cohort offline → inline banner; writes stay local until cohort returns
- [ ] Invitation invalid / expired → friendly message on acceptance screen
- [ ] Conflict resolution for concurrent edits (relies on Optimystic semantics)
