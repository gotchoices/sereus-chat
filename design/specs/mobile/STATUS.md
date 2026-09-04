# Target STATUS: mobile

Checklist for specs, screens and app code. Stories are tracked in
[`stories/mobile/STATUS.md`](../../stories/mobile/STATUS.md). Platform facts, hazards and upstream
questions live in [`domain/sereus.md`](../domain/sereus.md).

## Phases

- [x] `design/specs/project.md` complete
- [x] Stories exist and are numbered (19, all drafted; none human-reviewed)
- [x] `navigation.md` and `screens/index.md` reflect the story set
- [x] `components/index.md` current, incl. the new `StrandStatus`
- [x] Domain contract: `overview.md`, `schema.md`, `ops.md`, `interfaces.md`, `sereus.md`
- [ ] `domain/rules.md` — not yet needed
- [ ] Scenario docs and images under `design/generated/mobile/`

## Routes

13 active routes; all have a human spec, a consolidation, code, and have been seen on device with
their variants. Calls are parked (story 90).

| Route | spec | cons | code | seen |
|-------|------|------|------|------|
| StrandList | ✓ | ✓ | ✓ | happy · empty · error |
| ChatInterface | ✓ | ✓ | ✓ | happy · empty · error |
| StrandDetail | ✓ | ✓ | ✓ | happy · settled |
| StrandMedia | ✓ | ✓ | ✓ | happy · empty |
| MediaViewer | ✓ | ✓ | ✓ | image · fetching · unreachable |
| MediaPicker | ✓ | ✓ | ✓ | — |
| SearchInterface | ✓ | ✓ | ✓ | idle |
| InvitationGenerator | ✓ | ✓ | ✓ | happy |
| InvitationAcceptance | ✓ | ✓ | ✓ | live · dead |
| QrScanner | ✓ | ✓ | ✓ | emulator fallback |
| Profile | ✓ | ✓ | ✓ | happy |
| Settings | ✓ | ✓ | ✓ | happy |
| CadreManager | ✓ | ✓ | ✓ | mock-mode notice |
| VideoCallActive | — | — | — | **parked** |
| VoiceCallOverlay | — | — | — | **parked** |

## Done

- [x] Regenerated all 13 specs and consolidations from the 19-story set
- [x] `ConnectionsList` → `StrandList`, `ProfileSetup` → `Profile`; `Alerts` deleted
- [x] Data layer rewritten to `ops.md`: strand-shaped summaries, streaming search, no status field
- [x] `MessageBubble` status tick removed; `StrandStatus` added; `Badge` gained mention/draft/muted
- [x] Mock namespaces: Strands · Messages · Members · Invitations · StrandMedia · StrandState ·
      Search · Prefs · StorageUsage · Profile — with `fetching`/`unreachable` media so the third
      content state is exercisable
- [x] `USE_SEREUS = false` (mocks); live adapter adapted to the new interface, unwired ops grouped
- [x] `sereus://` registered in AndroidManifest (needs a native rebuild to take effect)
- [x] Retired dead locale namespaces; fixed a stale string that overrode designed copy
- [x] Fixed on device: mention vs. mute sort, mislabelled local media, missing attachments,
      unpinned footer, MediaViewer pager rendering one item for every page, viewer contrast

## Specs and consolidations

- [x] Consolidations refreshed 2026-09-03 (StrandList, ChatInterface, StrandDetail, StrandMedia,
      MediaViewer, InvitationAcceptance, CadreManager); dep-hashes re-run
- [x] Human specs for StrandList, StrandMedia, MediaViewer, InvitationAcceptance and CadreManager
      rewritten to carry only two things: **overrides** generation must not make differently, and
      **details the stories cannot supply** (e.g. StrandList's sort orders and that the choice is
      remembered). Everything else defers to the stories — appeus treats anything a human has not
      specified as latitude for generation (`reference/precedence.md`, rule 3)
- [ ] Apply the same two-category test to the remaining eight screen specs (chat-interface,
      strand-detail, search-interface, invitation-generator, settings, profile, media-picker,
      qr-scanner): keep overrides and anything the stories cannot supply, drop the rest. They are
      accurate but still restate story detail and prescribe layout generation should be free to
      choose. ~350 lines that could be ~150.
- [ ] Consider adding `needs:` frontmatter (domain primitives) to the screen specs — appeus's
      `spec-schema.md` offers it and it would tighten dependency tracking

## To do — behaviour the stories specify but no screen does yet

- [ ] **Edit a message** (13) — long-press offers Reply, React, Delete; no Edit
- [ ] **Soft vs. hard mute choice** (10, 33) — one undifferentiated "Mute" today
- [ ] **Mark unread again** (10)
- [ ] **Mention picker** (12) — typing `@` does nothing; mentions must resolve to a member
- [ ] **Open reaction set** (12) — fixed 👍 only
- [ ] **Promote a member** (05) — StrandDetail can resign but not confer
- [ ] **Rename a member locally** (31) — offered in the sheet, no handler
- [ ] **Trim storage** (21, 41) and an editable **storage ceiling** (41)
- [ ] **Swipe-to-archive** (30) and **archive/unarchive** actions
- [ ] **Search filters** — kind, date, sender (32); scope works
- [ ] MediaViewer **save** is an Alert stub

## To do — i18n

- [ ] Every new string needs a home in `locales/*/screens.json`. They render today only via code
      fallbacks, and the bundle **wins wherever a key exists** — so a stale bundle entry silently
      replaces designed copy (this already happened once).

## To do — assets

- [ ] Brand mark / image asset (empty states and headers use Ionicons only). Logo exploration is
      in `docs/`.

## Deep links for review

`chat://` works today; `sereus://` needs a native rebuild. Variants work on any route.

```
chat://strands?variant={happy|empty|error}
chat://strand/s-cycling            chat://strand/s-cycling/about
chat://strand/s-cycling/shared     chat://search
chat://invite    chat://invite/<token>    chat://profile    chat://settings    chat://scan
```

## Stack

Runs against the **published** sereus stack (npmjs): cadre-core 0.8.1 · optimystic 0.14.1 ·
quereus 4.3.1 · p2p-fret 0.6.0. Boot behaviour, hazards and upstream questions:
[`domain/sereus.md`](../domain/sereus.md).

## Known defects (not stack-related)

- [ ] `npx jest` fails 6/6 suites: bare `preset: 'react-native'` doesn't transform the ESM
      dependency tree
- [ ] `src/cadre/CadreService.ts` imports `CHAT_SAPP_ID` from the data layer; must become
      `configure({ sAppId })` before the cadre UI can be extracted

## Live-backend wiring plan (in progress, 2026-09-03)

Three passes. Only 1 and 2 are ours; 3 waits on upstream.

### Pass 1 — schema correctness — **DONE** 2026-09-03

The app imports `chat-sapp.qsql` directly (Metro raw-string transformer), so the contract and the
runtime schema are one file. `newId()` in `chat-operations.ts` mints UUIDs via the
`react-native-get-random-values` polyfill already imported at app entry.


`design/specs/domain/chat-sapp.qsql` + `apps/mobile/src/data/chat-operations.ts`:

- [x] `Message.Id` → client-generated **UUID text**. Today it is `max(Id)+1`, which is the exact
      shape of the verified upstream defect `optimystic-concurrent-same-pk-insert-silent-lww`:
      two writers compute the same id, both are told they succeeded, one message is lost
- [x] Drop `Message.Status` (no delivery or read state exists) and stop writing `'sent'`
- [x] Add `Message.ReplyToId` (story 12) and `Message.EditedAt` (story 13)
- [x] Add a `Reaction` table — `(MessageId, MemberId, Symbol)`, attributed, open symbol set
- [x] `Attachment.Uri` nullable (a fetching attachment has no local URI); add `ByteSize`
      and `DurationMs`; drop `location` from `Type`
- [ ] **Open question:** where a *group's* name lives. A private nickname is device-local, but a
      shared group name has to be in the strand and has no column

### Pass 2 — adapter ops that work on one device — **DONE** 2026-09-03

`sereus.ts` went from 18 unwired ops to 8.

- [x] `listMembers`, `getStrandState` — members from `App.Member`; strand state is honest about what
      it cannot know: manager rows are sereus's and no production path writes them, so a solo strand
      reports private / one manager / I can act
- [x] `editMessage`, `deleteMessage`, `react`, `unreact` — new helpers in `chat-operations.ts`;
      deleting a message also clears its reactions and attachments
- [x] `listAttachments` — a row held with no URI reports `fetching`, never absent
- [x] `listMessages` now carries reactions
- [x] `getPrefs`, `setPrefs` — device-local (AsyncStorage), never strand data
- [x] `storageUsage` — per strand, from attachment byte sizes
- [ ] `trimStorage` — **deliberately still unwired.** Whether dropping local copies weakens what the
      strand can serve is an open platform question; guessing would be worse than refusing
- [ ] `listOutstandingInvitations`, `cancelInvitation` — outstanding invitations live in the control
      DB as `FormationInvite` rows, not the strand. Reachable, but the API was not confirmed; left
      rather than invented. `StrandList` already degrades to an empty list

### Pass 3 — two-party (gated upstream)

- [ ] `acceptInvitation` — needs a consent handshake with a reachable host; cannot be exercised on
      one device. Until this works there is no second party and no group
- [ ] `inspectInvitation`, `leaveStrand`, `resignManager`, `removeMember`
- [ ] Blocked by platform: per-party identity not landed (every joiner presents the founding key,
      so there is no real sender attribution); RBAC not switched on in production. See
      [`domain/sereus.md`](../domain/sereus.md)

### Switching over

`USE_SEREUS = true` is **not** safe until pass 2 lands: `ChatInterface` calls `listMembers`
alongside `listMessages`, so a conversation would show an error banner rather than messages.

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
      `https://sereus.org/chat/invite/<encoded>` (`chat://` fallback), registered
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
