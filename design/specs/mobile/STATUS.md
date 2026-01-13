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
- [x] `design/specs/domain/schema.md` — SQL data model
- [x] `design/specs/domain/ops.md` — domain operations
- [x] `design/specs/domain/interfaces.md` — backend modes and adapter contract
- [ ] `design/specs/domain/rules.md` — validation, permissions (as needed)

## Screen/Component Slicing (mobile)
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

## Scenario / Peer Review (optional)
- [ ] Scenario docs/images under `design/generated/mobile/`

## Final Wiring

### Data Adapter Architecture
- [x] Adapter interface defined (`src/data/adapter.ts`)
- [x] MockAdapter implemented with variant support
- [x] QuereusAdapter stub created
- [x] Screens refactored to use adapter (no variant params)

### Quereus Integration

#### quereus-memory (in-memory, ephemeral)
- [ ] Integrate Quereus memory module
- [ ] Implement `listStrands()` via SQL
- [ ] Implement `listMessages()` via SQL
- [ ] Implement `getProfile()` / `saveProfile()` via SQL
- [ ] Implement `createInvitation()` / `acceptInvitation()`
- [ ] Verify data clears on app restart

#### quereus-store (persistent, single node)
- [ ] Integrate Quereus store module
- [ ] Verify schema migrations work
- [ ] Verify data persists across app restarts
- [ ] Profile edits persist locally
- [ ] Messages persist locally

#### quereus-sync (persistent, cadre sync)
- [ ] Integrate Quereus sync module
- [ ] Can add device to cadre (phone ↔ desktop)
- [ ] Profile syncs across cadre devices
- [ ] Pending messages sync when devices reconnect

#### quereus-optimystic (full DHT distributed)
- [ ] Integrate Optimystic module
- [ ] **Cadre operations**
  - [ ] Can invite device to cadre (QR/deep link)
  - [ ] Can accept cadre invitation
  - [ ] Cadre devices discover each other
- [ ] **Partner operations**
  - [ ] Can generate strand invitation
  - [ ] Partner can accept invitation
  - [ ] Strand established between cadres
- [ ] **Messaging**
  - [ ] Can send message to strand
  - [ ] Partner receives message
  - [ ] Messages replicate across strand cohort
  - [ ] Offline messages queue and sync
- [ ] **Attachments**
  - [ ] Can send image/file attachment
  - [ ] Attachment replicates to partner
- [ ] **Calls (future)**
  - [ ] Voice call signaling via strand
  - [ ] Video call signaling via strand

### Backend Mode Switching
- [ ] Environment variable `SEREUS_BACKEND` selects mode
- [ ] Dev build defaults to `mock`
- [ ] Release build defaults to `quereus-store` or `quereus-optimystic`
- [ ] Mode switch tested without code changes

### Error Handling & Edge Cases
- [ ] Network offline → graceful degradation
- [ ] Quereus errors surface as user-visible messages
- [ ] Retry logic for transient failures
- [ ] Conflict resolution for concurrent edits
