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

- [x] **`en/screens.json` is now generated from the code fallbacks** — 177 keys, up from 25, so the
      bundle and the designed copy agree by construction rather than by discipline. Two live hazards
      were found doing it:
  - **Five keys carried two different strings each** (`screens.strand.remove` was both "Remove from
    this strand" and "Remove"; likewise `forget`, `resign`, `invite.post`, `common.share`). Nothing
    had broken only because no bundle entry existed; the moment one did, one string would silently
    win in both places. Split into `*Confirm`/`forgetIt`/`shareAgain`.
  - **Eighteen dead keys** in the `chat.*` and `InvitationGenerator.*` namespaces survived the
    earlier retirement, in both `en` and `es`. Removed; `es` is pruned to the 7 real translations.
- [ ] Regenerate `en/screens.json` whenever strings change — every `t()` call now carries a default,
      so the generator is the source of truth. Worth a lint or a CI check.

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
- [x] **Attachment persistence** — `App.Attachment` had *no writer at all*: an attachment picked in
      the composer never reached the strand. `insertAttachments()` added; `send` persists them and
      `listMessages` reads them back per message
- [ ] `listOutstandingInvitations`, `cancelInvitation` — **confirmed blocked.** `CadreNode` exposes
      `publishFormationInvite` but no list or delete counterpart, and the strand-level
      `listOutstandingInvites()` operates on the RBAC layer that no production path writes.
      `StrandList` already degrades to an empty list

### Pass 3 — two-party (gated upstream)

- [x] `acceptInvitation` — **written, untested.** `decodeInvitation` → `formStrand(invitation,
      disclosure)` → attach with `FormStrandResult.memberPrivateKey` (**not** the invitation key —
      different keys; the wrong one yields a strand you cannot write to). Disclosure carries only
      the display name. Cannot be exercised on one device, so this is written from the cadre-core
      signatures rather than a passing run
- [ ] **Offer our RN native-crypto module upstream.** `src/cadre/noise-crypto.ts` has nothing
      chat-specific in it: it ports `@chainsafe/libp2p-noise`'s own `nodeCrypto` onto
      `react-native-quick-crypto`, behind the `NoiseCryptoMode` switch that keeps pure-JS crypto
      available for timeout debugging. The SEAM is already upstream — cadre-core 1.3.0 honours
      `network.noiseCrypto` and passes it to the control node and every strand node, and optimystic
      exports `NoiseCryptoInterface` and `noisePureJsCrypto` from `@optimystic/db-p2p` and `/rn` —
      but no implementation or guidance ships anywhere, and the cadre-core ticket says so outright:
      "Wiring an actual native library into `reference-app-rn` is a separate decision; don't do it
      here." So today every sereus RN app must write this itself, including the PKCS8 and X25519 DER
      prefixes and the Buffer aliasing against `@craftzdog/react-native-buffer` rather than the
      global — the kind of detail that should not travel by copy-paste the way the polyfills do.
      Proposed home: `@optimystic/db-p2p/rn`, beside `noisePureJsCrypto`, with
      `react-native-quick-crypto` as an optional peer dependency.
- [ ] `inspectInvitation`, `leaveStrand`, `resignManager`, `removeMember`
- [ ] Blocked by platform: per-party identity not landed (every joiner presents the founding key,
      so there is no real sender attribution); RBAC not switched on in production. See
      [`domain/sereus.md`](../domain/sereus.md)

### Pass 3 results — device joined a Node host, 2026-09-23

Exercised with `test/stack/two-party-formation.mjs --host` against the emulator, over the local
relay, with native crypto on. Five of seven join attempts attached (44–94 s); the other two failed
`StrandAwaitingFirstSyncError`, which remains intermittent and unexplained.

What this run proved, and the two app bugs it exposed:

- [x] **`acceptInvitation` works** — no longer "written, untested". A device redeems an invitation,
      attaches, and reads the host's rows.
- [x] **Strand-scoped reads honour their `strandId`.** Every per-strand adapter method ignored its
      parameter and opened the default strand — a pass-2 stub that outlived the arrival of real
      strand ids. A joined conversation therefore rendered empty while its rows sat in the database,
      so working replication looked like broken replication. `SereusAdapter.strandFor` resolves it
      now, and throws on an unattached id rather than falling back.
- [x] **A joiner registers itself in `App.Member`.** Self-registration lived inline in the
      default-strand path, and the only other writer was `saveProfile` — so anyone who joined a
      strand and did not then edit their profile was a participant the conversation had no record
      of. Now `registerSelfAsMember` runs on first join and on every re-attach.

- [x] **Incoming messages appear without leaving the screen.** `ChatInterface` read once on mount
      and never again, so a message the other party sent while you were looking at the conversation
      did not show up until you navigated away and back — for a chat app, the difference between
      working and not. It now refreshes on focus and polls every 10 s while focused. A POLL because
      there is nothing to subscribe to: cadre-core emits strand lifecycle events only
      (`strand:started`, `strand:writable`, …) and nothing per row, and optimystic's
      `onCollectionChange` is a documented no-op unless a `localChangeNotifier` was supplied at
      construction, which cadre-core does not do. Ten seconds is deliberately conservative — each
      pass is four Quereus queries, and CPU is what the stack's own sync work competes for.
- [x] **Full two-party round trip verified on device**, 2026-09-24. Emulator joined a Node host in
      24 s; the host's messages appeared on an untouched screen (ticks 14 → 30 with no interaction);
      a message typed on the device reached the host. Both directions, one conversation, live.

- [x] **Stack upgraded to sereus 1.4.0 / optimystic 1.5.0**, 2026-09-24, app and
      `test/stack` together (cadre-core 1.4.0 requires `@optimystic/*` ^1.5.0, so they move as a
      pair). `tsc` clean, Node two-party green, and the device join got FASTER — 18 s, against 24 s
      on 1.3.0/1.4.0 and 36-94 s before that. We pass no `connectionMonitor`, so the node now
      inherits 1.4.0's new default (30 s ping deadline, 35 s interval) — the fix for our own #13.
      NOTE: the reference relay container (`ops/docker/libp2p-infra`) carries the same values and
      per the release notes must be redeployed for its side to take effect; the running relay has
      not been.

Still open, and the reason a two-party conversation is not yet dependable:

- [ ] **Concurrent writes can wedge a collection permanently, on both machines.** When the
      device and the host both wrote `App.Message` at about the same moment, every subsequent write
      on *either* side failed with `sync for collection default/app/Message exhausted 10 retries:
      pending conflict: block(s) held by unresolved rival action(s) <id>` — the same rival action id
      each time. The host's unrelated 60 s writer stopped too. For a chat app this is bad enough as
      observed: two people typing at once is the normal case, not an edge case.

      **How long it lasted, precisely.** The host made zero successful writes for about eight
      minutes — five consecutive rival-action failures on one id, its peer alive and writing
      throughout — and the run then ended because the host process was killed. So the honest claim
      is "at least eight minutes with no progress", NOT "permanent". An earlier version of this note
      cited the device's error banner as evidence it never cleared; that was wrong. `ChatInterface`
      clears `error` only inside `load`, so the banner is a static record of the last send attempt,
      and by the time it was read the host had already been killed — the device had no peer at all.
      That strand cannot be revisited either: the harness stores under `mkdtempSync` and removes it
      on close. `contention-repro.sh` now reports the longest unbroken run of host failures, so this
      is a number to compare across versions rather than a yes/no to guess at. **Not yet reproduced device-free** —
      60 concurrent rounds in `two-party-formation.mjs` never collided, because both in-process
      parties write with almost no latency between them. Reproducing it probably needs the link
      latency injector (`ws-latency.mjs`) to widen the conflict window.

      This supersedes an earlier note here claiming a device's writes replicate *only* during the
      attach window. That was wrong. Late writes do cross — verified host-side — right up until a
      concurrent-write conflict wedges the collection, after which nothing crosses in either
      direction and the earlier evidence reads the same way.

      **Reproduced device-free, 2026-09-23** — `test/stack/contention-repro.sh` (run it against the
      dev relay). Two parties write the same collection at once and one of them is loop-starved;
      the starved party is then refused with the same errors the phone produced, including the
      exact one:

          exhausted 10 retries: pending conflict: block(s) held by unresolved rival action(s) <id>
          exhausted 10 retries: Pend blocks held: 2/2 member(s) hold an unresolved rival action (0/2 approvals)
          exhausted 10 retries: stale revision: block X at rev N, requested rev N, last seen block X at rev N

      The last one calls a revision stale while printing the same number three times. What does NOT
      reproduce is the permanence: on device both machines reported one rival action id for as long
      as they were watched, whereas here the starved party recovers after a few failures.

      What it took, and what failed to provoke it: full-speed concurrency (60 rounds), 60 ms of
      injected link latency, a joiner stopped mid-commit, and a joiner frozen with SIGSTOP and
      resumed — none collided. Only a writer that cannot keep up does it, which is the one thing
      Hermes does to a phone that Node does not do to itself. Two processes are required: one
      process has a single global WebSocket and a single event loop, so "slow" cannot be applied to
      one party alone. `--join <invite>` was added to `two-party-formation.mjs` for this.

      **Tested against optimystic 1.5.0 — NOT fixed there**, 2026-09-24. Two 600 s runs per
      version, same parameters, harness only (the app stayed on 1.4):

      | version | host ok | failed | rival-action | stale-revision | longest outage |
      | --- | --- | --- | --- | --- | --- |
      | 1.4.0 | 144 | 22 | 1 | 21 | 455 s / 21 |
      | 1.4.0 | 206 | 20 | 0 | 20 | 376 s / 16 |
      | 1.5.0 | 269 | 20 | 0 | 20 | 323 s / 15 |
      | 1.5.0 | 239 | 18 | 1 | 17 | 356 s / 17 |

      `rival-action` comes out {1, 0} on 1.4 and {0, 1} on 1.5 — the same distribution, so there is
      no evidence it is gone. (A first single run showed 1 → 0 and looked like a fix; the second
      pair is why one run per version is not enough to claim one.) Failure counts and outage lengths
      overlap across versions; the slower party is still shut out for five to seven minutes either
      way. The one metric that does separate is successful host writes — 1.4 {144, 206} against
      1.5 {239, 269}, non-overlapping — which fits
      `every-member-votes-for-whichever-racing-write-reached-it-first`: on a two-member cohort a
      first-round collision used to be "a guaranteed double loss" (the `0/2 approvals` above) and
      one writer now wins outright, so more rounds make progress. It does not shorten the outages.

      **Confirmed on device on the upgraded stack (sereus 1.4.0 / optimystic 1.5.0), 2026-09-24,
      and it is WORSE there than in Node.** A single message typed in the app collided with the
      host's periodic writer; the host then failed every write for **1097 s and counting** (7
      consecutive), against a 455 s worst case in Node. The app's own message never reached the host
      at all, and took ~90 s even to commit locally. Incoming replication kept working throughout —
      the app went on displaying the host's earlier messages — so this is specifically the write
      path, and it is silent: no error reached the app, the composer simply cleared and the message
      sat there. One person typing one message is enough to trigger it. This, not the join path, is
      what stands between us and a usable chat app.

      The dominant failure on BOTH versions is `stale revision`, which 1.5 does not address and
      whose message contradicts itself — same block, same number, three times:
      `stale revision: block X at rev 376, requested rev 376, last seen block X at rev 376`.
      That is the thing to report upstream, with this script attached.
- [ ] **First sync needs a settled node, not just a longer deadline.** `addStrand` fails with
      `StrandAwaitingFirstSyncError` — "no member of this strand has been reachable since this
      machine joined" — when the invitation is redeemed too soon after app start. Seven consecutive
      failures cleared as soon as the device was given several more minutes to settle before Join
      was pressed. Raising the budget alone does not help: with
      `strandFirstSync.timeoutMs: 120_000` it waited the full 120 s and still found no member. The
      relay and the pure-Node path were healthy throughout (Node first sync: 1.4 s), so this is
      device-side readiness, not infrastructure. `myAddrs` was also seen flapping 4 → 0 → 4 mid-attach.
      **Open question for upstream:** what a joiner should wait on before redeeming, since
      "the responder has addresses" is evidently not sufficient.
- [ ] **Schema changes strand existing data.** Adding `null` to columns in `chat-sapp.qsql` made
      already-founded strands fail on open with `ALTER TABLE App.Member ALTER COLUMN AvatarUri DROP
      NOT NULL` → `Module for table 'Member' does not support ALTER COLUMN`. Dev worked around it by
      wiping; there is no migration path, which matters before anyone ships.
- [ ] `inspectInvitation`, `leaveStrand`, `resignManager`, `removeMember`
- [ ] The acceptance screen's `Retry` calls `load`, which re-inspects a spent invitation instead of
      re-attaching.

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
- [x] **Relay reservation works end to end.** A `chat://relay?addr=…` link →
      RelayOffer → accept → the relay grants a `/p2p-circuit` slot, and "My
      network" reports *Working — people can reach you through this* from the
      LIVE posture (`getRelayReservationState()`), not from the fact an address
      is saved. Survives a cold restart (`reserveSavedRelays()` on boot: a
      reservation lives with the running node, not the stored address).
      Four things had to be fixed to get there:
  - `listenAddrs: ['/p2p-circuit']` — the bare "search" listener is where a
    reservation lands. cadre-core only adds one when `relayAddrs` is set at
    config time, which we avoid (it makes a dead relay fatal to `start()`).
    Without it there was nowhere for a reservation to go.
  - `connectionGater: { denyDialMultiaddr: () => false }` — libp2p's default
    refuses private/loopback and insecure-ws addresses, i.e. the emulator's
    `10.0.2.2`, a relay on the house wifi, and any relay not behind TLS.
  - **`WebSocket.bufferedAmount` polyfill (`index.js`) — the big one.** RN
    declares the field but never assigns it, so it is `undefined`;
    `@libp2p/websockets` computes `canSendMore = bufferedAmount < max` →
    always false, and the drain poll tests `=== 0` → never fires. Every
    libp2p WebSocket write therefore blocked until the socket closed and then
    rejected with `undefined`, which libp2p's upgrader turned into
    "Cannot read property 'message' of undefined". **libp2p WebSockets cannot
    work in React Native without this** — worth reporting upstream, and worth
    adding to sereus's `docs/reference-app-rn.md` polyfill table.
  - `DOMException` + `AbortSignal.timeout` polyfills (absent from Hermes).
- [x] **Dev scripts for the two-instance pair.** `yarn relay` runs the relay and
      now tees its output to `$DATA_DIR/relay.log` so the peer id can be read
      back; `sh ./scripts/link.sh relay --all` derives the address, picks
      `10.0.2.2` vs `127.0.0.1` per device kind, runs `adb reverse` for USB
      devices, and sends the offer. Note the trap it exists to avoid: `adb shell`
      re-parses the command ON the device, so an unquoted `&` truncates a query
      string silently — `launch:android` had this bug and now routes through
      `link.sh`.
- [x] **Control-DB writes hanging on a solo node — FIXED by upgrading** (was
      gotchoices/sereus#10, now closed). On cadre-core **0.12.0** + db-p2p **0.28.0**
      `Owner key inserted` and `Strand inserted` both land in ~8 s; owner genesis
      finishes in 9.5 s instead of timing out. Branch `upgrade/cadre-0.12`.
      Two upgrade gotchas worth remembering: a `resolutions` block in
      `apps/mobile/package.json` pins the whole stack (bump it too, or the install
      silently changes nothing), and db-p2p 0.28 ships **static class blocks**, needing
      `@babel/plugin-transform-class-static-block` plus `yarn start --reset-cache`.
- [x] **RESOLVED 2026-09-18 — founding converges.** Root cause was **not** in sereus or
      optimystic at all: a defect in Babel's `wrapAsyncGenerator` helper before **7.29.2**,
      which *"drops async-generator cleanup after an await in a finally block when iteration
      stops early"* — leaving Quereus's execution lock **held forever**. We were on 7.28.6.
      cadre-core/optimystic **1.0.0** added a startup self-check that detects it and says
      exactly what to do; that check is what finally named it.
      Fix: pin `@babel/runtime` and `@babel/helpers` to `^7.29.2` (deps **and** resolutions —
      RN's preset pulls its own copies), then rebuild. Now:
      **owner genesis 457 ms, strand founded and attached in 4.2 s**, clean boot, no warnings.
      Previously: never, across 44 min, three stacks and two hosts.
      Why every earlier experiment missed it: Node runs async generators **natively** and never
      loads the Babel helper, so the Node arm always passed — the A/B was measuring the
      transpile, not the runtime. It also explains why the failure was insensitive to schema
      size, storage latency, listen addresses and read-repair: a held lock is none of those.
- [x] **Two-device invitation reached the network, 2026-09-18.** Emulator + Galaxy S7 Edge, both
      on 1.0.0 + the Babel fix, both holding relay reservations ("Working — people can reach you
      through this"). Achieved for the first time: **an invitation minted** (real
      `sereus://invite/…`, 1,212 chars, bootstrap list carrying `/p2p-circuit/` relayed addrs),
      **delivered to the second device**, and **the acceptance screen rendered** with the
      unattributed wording.
- [ ] **Join fails at formation validation.** `Responder result failed validation` —
      cadre-core's `isValidResponderCreatesResult`, which rejects on any of: not approved, no
      `partyId`, empty or placeholder `cadrePeerAddrs`, missing `provisionResult.strand.strandId`,
      `createdBy !== 'responder'`, or a malformed `membershipInvite`. The host DID respond (a
      timeout would look different), so the relay round-trip works. Next: run both sides with
      `DEBUG='sereus:cadre:*'` to see which arm of that check fails.
- [ ] **Our `acceptInvitation` passes a disclosure shape that does not exist.** It sends
      `{ name }`, but `StrandFormationDisclosure` is `{ partyId?, identityBundle?, purpose?,
      metadata? }` — hidden by an `as any`. Also `joinChatStrand` builds a `StrandRow` without
      `FounderOwnerKey`, required since 0.13.0, behind another `as any`. Both need fixing before
      the validation failure can be cleanly attributed.
- [ ] **Cold-start deep-link race:** an invitation link opened before the cadre finishes starting
      shows "Cadre is not running." The screen should wait for readiness rather than fail.
- [ ] `inspectInvitation` is still `notImplemented` in `SereusAdapter`, so
      InvitationAcceptance would throw the moment a scanned token opened it.
      `acceptInvitation` is written but its docstring records it as UNTESTED.
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

## Waiting on sereus — revisit when these upstream tickets land

Booked here rather than in a new `apps/mobile/STATUS`: this file already tracks app
code, and a second status file would split the same subject in two. Each entry names
the upstream ticket, what we do TODAY because of it, and what to undo when it lands —
the last part is the point, because a workaround whose trigger nobody recorded
outlives its cause.

- [ ] **`feat-cross-party-strand-addr-durability`** (sereus `tickets/backlog/`, marked
      `hard`) — cross-party strand addresses are seeded ONCE, at formation, from
      addresses held in memory, and nothing can re-resolve them. The ticket names three
      consequences, all of which are ours: a party that **restarts** cannot be re-found
      until a fresh invitation is exchanged; a party whose **relay changes** strands
      every peer holding the old address; and in a **3+ party** strand, late joiners
      never learn the addresses of parties they never exchanged an invitation with.

      Its own words: "Two people's shared workspace stays connected only while both apps
      keep running."

      *Today:* stories 02/03 quietly assume a strand stays reachable across restarts. It
      does not. Do not build a client-side address cache to paper over this — the fix is
      a replicated signed address registry in the strand DB, and a local cache would
      have to be unpicked when it arrives.

      *When it lands:* re-read the invitation and strand stories against real
      reachability, and decide what (if anything) the UI should say about a party that
      cannot currently be reached. See also `feat-strand-member-allowlist-admission`,
      which the ticket says should be designed together with it.

- [ ] **Runtime relay changes** — relays are named at node construction
      (`network.relayAddrs`), the only path that reaches strand nodes;
      `CadreNode.reserveRelays()` covers the control node alone and is documented as the
      fail-soft entry point for callers that learn a relay late.

      *Today:* `CadreService.applyRelays` rebuilds the node when the relay set changes on
      a running node — a few seconds of reconnecting, and no identity change (the peer
      key is reloaded from the control store). Rare by construction: relays are chosen at
      setup, and every launch afterwards names them before the node starts.

      *When it lands:* if cadre-core ever grows a runtime path that reaches strand nodes,
      drop the rebuild and apply relays in place.

- [x] **Strand type — FIXED and verified on device (2026-09-19).** We founded every
      strand `type: 'o'` and then attached the joined row as `Type: 'c'` with a null
      key: a closed strand readable by nobody. Chat strands are now founded CLOSED with
      `generateStrandMemberKey()`, mirroring `createClosedChatStrand` in
      `reference-app-rn` and the shape upstream's blind-relay scenario exercises; the
      join side picks the type from whether formation returned a `memberPrivateKey`,
      rather than hard-coding one. Verified: both devices log `founded closed strand`,
      and minting an invitation now creates a NEW strand instead of binding the
      default one.

      Superseded diagnoses, kept so they are not re-derived: (1) "the formation address
      seed only flows one way" — wrong; `strand-formation-cross-party-seed` asserts the
      joiner dials in and the host sees the inbound connection. (2) The
      `cohort-unreachable` error behind it was observed after BOTH devices had
      restarted, which is the known in-memory-address limit
      (`feat-cross-party-strand-addr-durability`), not a new defect.

      No upstream gap to file: `blind-relay-phone-to-phone-e2e.integration.ts` covers
      our exact topology — two parties, `listenAddrs: []` + `relayAddrs`, one neutral
      relay — and asserts data flowing BOTH ways with every connection proven relayed.

- [x] **THE STACK IS NOT THE PROBLEM — two-party chat works in Node (2026-09-20).**
      `test/stack/two-party-formation.mjs` (`yarn stack:two-party`) stands up TWO
      parties in one Node process, both shaped like phones — `listenAddrs: []`,
      reachable only through `relayAddrs` — against the same relay the devices use.
      It founds a closed strand, publishes a BOUND invitation, redeems it from the
      other party, and reads a row written by the host.

      Deterministic, twice in a row: formation 120 ms, **first sync 1.2 s**, host's
      row visible to the joiner at 2.8 s total. The same sequence on two devices
      ends in `StrandAwaitingFirstSyncError` after 30–70 s.

      So cadre-core, optimystic, quereus, circuit-relay and our own formation logic
      all do this correctly. What remains is mobile-specific: React Native, the
      emulator's networking, or the `adb reverse`/USB transport. That bounds the
      search to the device side and means there is nothing to file upstream.

      Worth keeping: the harness caught a real trap on its first run. Passing
      `initializeStrandSolicitation({})` with no `formationUsageRecorder` makes
      cadre-core treat every invite as UNBOUND — the responder mints a brand new
      strand per joiner, returns no membership key and no strand addresses, and the
      joiner waits out first sync against a strand with no other member. It is
      indistinguishable from the device failure at a glance. Our app passes the
      recorder; anything new that calls this must too.

- [x] **CORRECTED: there is no 10 ms latency cliff. Our injector was wrong.**
      (filed as gotchoices/sereus#13; corrected by the maintainer 2026-09-21)

      What we reported: two-party strand formation failing at 10 ms of per-frame
      outbound delay, passing at 5 ms, deterministic. What was actually true: our
      injector held every frame on ONE promise chain, so frame *k* waited for the
      *k-1* frames ahead of it to serve their delays first. The delay COMPOUNDED.
      That models an outbound frame-RATE cap of 1000/delay frames per second per
      socket — not latency, where frames stay overlapped and a constant delay
      shifts them all equally.

      The comment on our own code said "one chain per socket keeps frame ORDER
      intact", which was the intent; serialising the DELAYS as well was not noticed.

      Why it produced such a sharp cliff: bring-up is frame-heavy. Measured with
      `WS_COUNT_FRAMES=1`: **7,474 outbound frames across 4 sockets, busiest 3,585**,
      for a run that completes in 2.8 s. At 10 ms compounding, that one socket needs
      ~36 s to drain. Upstream measured the same order (~10,800 / ~5,200).

      Re-tested with each frame delayed INDEPENDENTLY (`WS_SEND_DELAY_MS=<n>`, the
      new default; the old shape is kept as `WS_SEND_DELAY_MODE=serial` because
      upstream kept it under that name):

      | one-way delay | outcome |
      |---------------|---------|
      | 10 ms         | PASS |
      | 50 ms         | PASS |

      So delay alone does not break this, and phone-to-phone over a WAN relay is not
      blocked in the way we claimed. Upstream additionally reports degradation above
      ~100 ms (first sync completes; membership rows miss a deliberately tight 20 s
      gate), and notes that BANDWIDTH is the untested variable — given the frame
      counts above, a congested mobile link is the case nobody has measured.

      *What the report did achieve:* their relay scenarios all ran on loopback with
      no delay, so nothing in the suite could have caught a latency regression. They
      landed a latency fixture with both modes plus a committed 10 ms scenario. They
      are also investigating the round-trip cost behind all of this — a single
      message insert measured at **48–130 network exchanges** on the initiating
      party's link — which sits in Optimystic rather than sereus.

      *Lesson worth keeping:* the injector was never validated against a known
      quantity before its numbers were published. A frame counter existed in five
      lines and would have shown the compounding immediately.

- [x] **ROOT CAUSE FOUND AND FIX VERIFIED: libp2p's ConnectionMonitor aborts
      connections when a CPU-saturated peer misses a ping.** (2026-09-22)

      `ws-trace.mjs` wraps `close()` to capture the CALLER's stack (a stack taken in
      the close EVENT is useless — it unwinds to the event loop), so each close is
      attributable. The failing run: 23 opens, 20 closes, of which **16 REMOTE
      code=1006** and 3 REMOTE 1005 — abnormal closures with no close frame. Only
      one was ours. So the far end was killing them, and every one of these sockets
      terminates at the relay.

      Running the relay with `DEBUG=libp2p:connection-monitor*` says it outright,
      30 times in one run:

          libp2p:connection-monitor:error aborting connection due to ping failure
          libp2p:connection-monitor:error error during heartbeat DOMException [TimeoutError]

      THE LOOP: libp2p pings every connection every 10 s and, with
      `abortConnectionOnPingFailure` defaulting to TRUE, kills any connection whose
      ping times out. A CPU-saturated peer cannot answer. The connection dies, the
      client re-dials, the new connection costs a fresh Noise handshake (~231 ms of
      CPU at S7 rates), which saturates it further, which misses more pings. That
      is the amplification, and nothing in it involves a deadline we could raise.

      THE FIX, verified end to end at FULL measured S7 crypto cost:

      | configuration | sockets | result |
      |---|---|---|
      | stock | 17-23 | **0 of 3 pass** |
      | `abortConnectionOnPingFailure: false` on the RELAY only | 4-8 | 2 of 3 pass |
      | ...on BOTH ends | 4 | **3 of 3 pass** — 86 s, 86 s, 106 s |

      With it off on both ends the system does exactly what it should: ~30x slower
      than baseline (2.8 s -> ~90 s), matching the injected slowdown, and correct.
      Slow, not broken.

      This is also where an adaptive-timeout scheme would genuinely help: the ping
      already uses `AdaptiveTimeout`, but adapting the DEADLINE does not help if the
      consequence of missing it is to destroy a working connection. The remedy is
      either not aborting on ping failure, or requiring sustained failure before
      concluding a peer is gone (phi-accrual style) rather than a single timeout.

- [x] **CONNECTION CHURN PROVEN — cause still unidentified; three suspects ruled
      out.** (2026-09-22)

      Two independent censuses, both cheap to repeat: sockets opened
      (`WS_COUNT_FRAMES=1`, transport level) and Noise handshakes performed
      (`cpu-cost.mjs` per-primitive counts; `keygen`/`dh` are the handshake's
      asymmetric steps).

      | injection | sockets | keygen | dh | frames | result |
      |---|---|---|---|---|---|
      | baseline (0.02x) | 4 | 12 | 24 | 6,059 | PASS |
      | `CPU_SLOWDOWN=0.5` | 7 | 17 | 39 | 5,324 | PASS |
      | `CPU_SLOWDOWN=1.0` | **17** | **41** | **107** | **13,092** | FAIL |
      | `LOOP_HOG_DUTY=0.95` (6x slower, PASSES) | **4** | — | 11,214 | PASS |

      The control is what makes this conclusive: running SIX TIMES SLOWER through
      loop starvation opens the same 4 connections and completes. Expensive crypto
      opens 17 and never finishes. So this is not "the same work, slower" — it is
      materially more work, and the extra work is connections and handshakes.

      RULED OUT as the driver (each raised and re-measured at 1.0x):

      | suspect | change | sockets | result |
      |---|---|---|---|
      | Fret maintenance deadlines (all) | 10x | — | still fails |
      | libp2p DIAL/ADDRESS_DIAL/UPGRADE/NEGOTIATION | 10x | 17 -> 13 | still fails |
      | db-p2p `maxConnections` | 16 -> 256 | 17 -> 11 | still fails |

      Each nudges the count without changing the outcome, so none is the trigger.
      What actually causes the re-dialing is NOT yet identified. All three patches
      reverted; harness verified back to a 2.6 s baseline pass.

- [x] **NOT timer starvation. The amplification is driven by EXPENSIVE RETRIES.**
      (2026-09-22)

      `test/stack/loop-hog.mjs` blocks the event loop on a duty cycle while leaving
      crypto at native speed — isolating "timers and handlers run late" from
      "each operation costs more".

      | injection | loop blocked | result |
      |---|---|---|
      | `LOOP_HOG_DUTY=0.5` | 50% | PASS, 4.8 s |
      | `LOOP_HOG_DUTY=0.8` | 80% | PASS, 8.4 s |
      | `LOOP_HOG_DUTY=0.9` | 90% | PASS, 13.3 s |
      | `LOOP_HOG_DUTY=0.95` | 95% | PASS, 23.3 s |
      | `CPU_SLOWDOWN=1.0` | ~96% (inside crypto) | **FAIL** |

      Starving the loop 95% of the time — the same duty the crypto burn produces —
      degrades exactly as one would want: first sync 1.4 s -> 7.8 s, total 2.8 s ->
      23.3 s, still correct. Only when the cost sits INSIDE the crypto path does it
      diverge.

      So the trigger is not late timers, and that also explains why raising every
      Fret budget 10x changed nothing.

      THE MECHANISM, then: something retries, and the retried unit of work is
      itself crypto-heavy — a fresh Noise handshake is ~231 ms of CPU on S7 figures.
      Under starvation a retry is still cheap (native crypto), so the loop settles.
      Under slow crypto each retry is expensive, so failures beget more expensive
      work: 0.5x cost -> 22k ops / 48 s (passes); 1.0x -> 43k ops / 313 s (fails).
      That is the superlinear growth, and it points at connection churn — failed
      dials producing new dials producing new handshakes — rather than at any
      single deadline.

- [x] **Divergence investigated: Fret's deadlines are NOT the trigger; the failure
      is streams dying mid-negotiation.** (2026-09-22)

      Upstream's backlog ticket `bug-slow-peer-crypto-cost-diverges-into-retry-
      amplification` names `MAINTENANCE_RPC_TIMEOUT_MS = 2000` (Fret) as a suspect.
      Tested in the harness at `CPU_SLOWDOWN=1.0`:

      - raising that constant 2 s -> 30 s: still fails.
      - raising EVERY Fret budget 10x (snapshot, stabilize tick, phase-one,
        shutdown, leave-notice) as well: still fails.

      So the suspect is wrong, or at least insufficient. Worth telling them before
      anyone spends time there.

      WHAT THE INSTRUMENTATION SHOWS instead — same run, same debug, slow vs fast:

      | | baseline | `CPU_SLOWDOWN=1.0` |
      |---|---|---|
      | dial:ok / dial:fail | 78 / 2 (2.5% fail) | 50 / 19 (**28% fail**) |
      | fret announce timeouts | 0 | **10** |
      | result | PASS in 3.8 s | FAIL |

      Failure reasons under load, in order: `Unexpected EOF - stream closed while
      reading 0/1 bytes` (7), `Protocol selection failed - could not negotiate
      /optimystic/strand-X/db-p2p/block-transfer/1.0.0` (4), `All multiaddr dials
      failed` (4), aborted/timeout (3). At baseline the only fret errors are
      `foreign-protocol` against the relay (expected — it speaks no FRET) and
      `sendLeave unreachable` at shutdown.

      Reading: CPU-bound crypto blocks the single-threaded JS loop, so timers and
      handlers run late; peers give up mid-negotiation and close streams before any
      byte arrives; the dial fails; the work is retried; the retry costs more
      crypto. That is the amplification loop, and it is consistent with the phone
      (same `Unexpected EOF`, same announce timeouts).

      ONE HONEST DIFFERENCE from the device: in Node the cohort DOES reach two
      members (81 observations of `peers=2`), where on the S7 it never did
      (`peers=1` always). Upstream reported the same. So the Node model reproduces
      the failure but not every step of the device's path — the device is worse
      than the model, which matches the emulator failing where the model predicted
      it should pass. The injector charges only Noise crypto; the device also pays
      Hermes tax on ed25519 signing, quereus, protobuf and storage.

- [x] **The crypto cost is REACT NATIVE, not the old phone. Hardware contributes 2x;
      the runtime contributes 11-198x.** (2026-09-22)

      Same diagnostic, three runtimes, all on the SAME native architecture — an
      Intel i9-9980HK Mac, an x86_64 emulator running natively on it (no
      translation), and the Galaxy S7:

      | primitive | Node (V8 + native) | Emulator (Hermes, i9) | S7 (Hermes, 2016 ARM) |
      |---|---|---|---|
      | x25519 shared secret | 2.635 ms | 29.000 ms | 57.650 ms |
      | ed25519 sign | 1.370 ms | 11.500 ms | 26.000 ms |
      | ed25519 verify | 2.720 ms | 45.900 ms | 89.950 ms |
      | chacha20-poly1305 (512B) | 0.053 ms | 2.735 ms | 7.760 ms |
      | sha256 (512B) | 0.027 ms | 5.335 ms | 15.165 ms |
      | WebSocket.send (512B) | — | 0.370 ms | 0.700 ms |

      The emulator has a desktop CPU and is still 11x to 198x slower than Node on
      the same machine. The S7 is only about 2x slower than that. So the 2016
      handset is a minor term: what dominates is Hermes interpreting pure-JS crypto
      where Node runs OpenSSL/WASM.

      WHAT THAT CHANGES. `noiseCrypto` (optimystic 1.3) is not an accommodation for
      legacy hardware — every React Native device needs it. A modern phone should
      land near the emulator's figures: ~116 ms of crypto per Noise handshake and
      ~40-56 s of symmetric crypto per bring-up. That is inside the passing range we
      measured (0.25x-0.5x of S7 cost passed, 1.0x failed), but not by much, and it
      degrades with every extra strand and every slower device.

      Also worth noting: `WebSocket.send` is 0.37 ms on the emulator against 0.70 ms
      on the phone — the bridge scales with hardware as one would expect, and stays
      a minor term either way. It is the crypto that does not scale.

- [x] **DEVICE-FREE REPRODUCTION, and it is not a timeout: work grows
      SUPERLINEARLY with per-op cost.** (2026-09-21)

      `CPU_SLOWDOWN=<fraction> yarn stack:two-party` (`test/stack/cpu-cost.mjs`)
      charges the measured S7 crypto cost inside the Noise crypto implementation
      and busy-waits it. A blocking burn is the FAITHFUL model here — a busy CPU
      really does block other work — which is the opposite of the latency case,
      where serialising was wrong because frames overlap in flight.

      | fraction of S7 cost | first sync | total | crypto ops | CPU burned | result |
      |---|---|---|---|---|---|
      | 0     | 1.4 s  | 2.8 s  | —      | —       | PASS |
      | 0.05  | 1.6 s  | 7.3 s  | 9,940  | 3.2 s   | PASS |
      | 0.10  | 1.7 s  | 14.3 s | 13,572 | 9.8 s   | PASS |
      | 0.25  | 4.4 s  | 30.6 s | 19,061 | 25.4 s  | PASS |
      | 0.50  | 26.1 s | 53.5 s | 22,038 | 48.1 s  | PASS |
      | 1.00  | —      | fails  | 42,557 | 313 s   | **FAIL** |

      Up to half the device's cost it degrades exactly as one would hope: slower,
      and correct. At full cost it does not merely take longer — it never finishes.

      THE SHAPE IS THE FINDING. Going from 0.5x to 1.0x doubles the per-operation
      cost but multiplies total crypto work by ~6.5x (22k ops / 48 s -> 43k ops /
      313 s). That is retry amplification: internal deadlines lapse, the work is
      retried, the retries cost more crypto, which lapses more deadlines. Raising
      the first-sync budget from 30 s to 300 s did not help — it burned 313 s of
      CPU and still failed, where 0.5x needed only 48 s in total.

      So "a slow device should just be slower" is right in principle and holds up
      to a point, but there is a regime past which this stack does not degrade, it
      diverges. That is worth fixing on its own terms, independently of making the
      crypto faster.

      *Harness bug found and fixed along the way:* `strandFirstSync.timeoutMs` is
      NODE config, not an `addStrand` option. We had been passing it to
      `addStrand`, where it is silently ignored, so every earlier run used the 30 s
      default while the logs implied otherwise.

- [x] **ROOT CAUSE: Hermes runs the pure-JS crypto 20-560x slower than Node, and
      bring-up needs ~7,000 frames of it.** (measured 2026-09-21)

      `Settings → Diagnostics → Handshake + frame cost` on the device, against
      `node test/stack/handshake-cost.mjs` on the same machine as the relay. Same
      primitives, same sizes, same code path libp2p uses.

      | primitive | Node (V8, x64) | Galaxy S7 (Hermes, ARM) | ratio |
      |---|---|---|---|
      | x25519 shared secret | 2.635 ms | **57.650 ms** | 22x |
      | ed25519 sign | 1.370 ms | 26.000 ms | 19x |
      | ed25519 verify | 2.720 ms | 89.950 ms | 33x |
      | chacha20-poly1305 seal (512B) | 0.053 ms | **7.760 ms** | 146x |
      | sha256 (512B) | 0.027 ms | **15.165 ms** | 561x |
      | WebSocket.send (512B) | — | 0.700 ms | — |

      What that buys:

      - **~231 ms of CPU per Noise handshake** on the phone (Node: ~10.5 ms). Every
        connection pays a quarter second before a byte moves, and a relayed strand
        mesh opens many.
      - **~160 s of pure symmetric crypto** across a 7,000-frame bring-up (Node:
        ~0.56 s). That single figure explains every timeout we have chased: FRET's
        announce, `Formation dial-connect timed out after 5000ms`, the relay
        reservation lapsing, and first sync. Nothing was ever unreachable.
      - **The bridge is NOT the bottleneck.** `WebSocket.send` costs 0.7 ms/op —
        ~4.9 s per bring-up, ~30x less than the crypto. The `bufferedAmount`
        backpressure gap is real but nowhere near the dominant cost.

      WHY: Hermes has no JIT. `@noble/*` is pure JavaScript, so V8 optimises it
      heavily and Hermes interprets it. The symmetric primitives suffer worst
      (sha256 561x) because they are tight bit-manipulation loops — exactly what an
      interpreter is worst at and a JIT is best at.

      *Caveat:* the app's own strand work runs during the measurement and competes
      for the CPU, so treat these as an upper bound. The conclusion survives halving
      them.

      *Direction, not yet decided:* native crypto on RN (e.g. `react-native-quick-crypto`,
      or noble with a native backend) is the obvious lever, and would cut the
      dominant term by orders of magnitude. Reducing the frame count is the other —
      upstream is already investigating the 48-130 network exchanges per message
      insert, and that multiplier is what turns per-frame cost into minutes.

- [ ] **Device-side detail behind the above** — the joiner's strand node cannot
      complete a FRET announce over
      the relay in time, so the host never enters its ring.** (2026-09-20)

      A real phone on Wi-Fi joining the Node harness (`--host`) — a counterpart that
      completes the same sequence in 1.2 s — still fails. That removes the emulator,
      `adb reverse`, USB and the mobile host in one step. The chain, measured end to
      end on the device:

      1. Formation succeeds; the seed is correct — `4 strand addr(s), memberKey=true`.
      2. The seed IS merged into the strand's address book:
         `address book merged (peers=1, merged=1, … dropped=0)`. Discovery is fine.
      3. The joiner dials the host's strand node and the dials **do connect** —
         `dial:ok ms=1599` and `dial:ok ms=38965`. Others fail with
         `Unexpected EOF - stream closed while reading 0/1 bytes` and
         `All multiaddr dials failed`.
      4. FRET cannot finish its handshake at that latency:
         `fret:error announce to 12D3KooWJZyy… : timeout` (and once `unreachable`).
      5. So the host never joins the ring. Every `findCluster:done` reports
         `peers=1 addressless=0 selfRelayOnly=0`, and `cohort:membership` shows
         `serves=1 … cohort=1` — a cohort of one. `addressless` and `selfRelayOnly`
         are both ZERO, which is the proof that this is not an address problem.
      6. First sync therefore has nobody to fetch from and times out, exactly as
         `StrandAwaitingFirstSyncError` says.

      The headline number: **a circuit dial that Node completes in milliseconds takes
      1.6 s to 39 s on the phone.** Nothing downstream can work at that latency.

      *Ruled out:* the stack (Node does all of this in 1.2 s over the same relay,
      same sApp, same schema); the Babel async-generator bug (pins hold at 7.29.7,
      one copy); the relay's libp2p major skew (upgraded; cleared a spurious
      `TimeoutNaNWarning`, changed nothing else); the emulator and `adb reverse`
      (absent from this test); missing or unusable addresses (counters are zero).

      *Tried and rejected:* libp2p's backpressure IS disabled on RN — the adopted
      `bufferedAmount` polyfill returns 0 and `@libp2p/websockets` gates writes on
      `bufferedAmount < maxBufferedAmount` (4 MB), so `canSendMore` is always true.
      A real approximate signal only changed the symptom (the relay reservation
      recovered instead of staying lost); `peers=0` and the failure were unchanged.
      Experiment reverted. Still worth reporting upstream as a property of the
      shared polyfill.

      *Next:* find where the seconds go in an RN circuit dial. The candidates are
      the noise handshake under Hermes (this is a 2016 phone, and we measured it
      ~5x slower than the emulator on owner genesis, which is also crypto), RN's
      WebSocket throughput across the JS bridge, and contention from the several
      strand nodes this app runs at once. A dial that takes 39 s is not a tuning
      problem — something is pathologically slow, and it should be measurable in
      isolation with a single dial and no strand work around it.

- [ ] **Relay reservations are the fragile link, and the dev harness makes it worse.**
      Not yet isolated to a cause. What is established:

      - A relay reservation can lapse while `CadreNode.getMultiaddrs()` still returns
        the circuit addresses it produced. We saw the app report "advertising 4
        addresses" with ZERO live connections to the relay. `createOpenInvitation`
        fills an invitation's bootstrap list from exactly that, so an invitation can be
        minted carrying addresses that no longer route.
      - `createInvitation` checks `getMultiaddrs()` and then calls
        `createOpenInvitation`, which checks again — and we have seen it pass the first
        and fail the second ("No multiaddrs available for invitation") after creating
        the strand. The strand survives, the invitation does not.
      - Restarting the relay leaves `adb reverse` entries that still LIST but no longer
        carry. They must be torn down and rebuilt (`reverse --remove-all`, then
        `link.sh reverse`).
      - `nc` through an `adb reverse` tunnel is not a valid liveness probe: adb accepts
        the connection locally even when nothing is listening on the Mac, so it returns
        success against a dead relay.

      *Next:* re-validate from a clean slate — relay started in its own terminal, fresh
      emulator, tunnels rebuilt — before drawing any conclusion about the stack. The
      last stretch of instability was traced to a relay this session had killed, and
      the environment must be trustworthy before the app's behaviour is.

- [ ] **The invitation screen's Private/Open choice does nothing.**
      `InvitationGenerator` collects `visibility` and passes it to
      `createInvitation`, which accepts the parameter and never reads it. The
      invitation always binds to the default strand, whose type was fixed when it was
      founded on first run — so choosing "Private — only people you invite can be in
      it" changes nothing about who can join. A promise the UI makes in words and the
      data layer does not keep. Tied to the strand-type fix above: the type has to be
      decided where the strand is created, not where an invitation is minted.

- [ ] **Ours: `Retry` on the acceptance screen retries the wrong thing.**
      `StrandAwaitingFirstSyncError` is explicitly retryable — the strand stays
      launched and wants another `addStrand`. Our banner's Retry calls `load`, which
      re-inspects the INVITATION, whose token is already spent. So the one action we
      offer at the one moment it matters cannot succeed. Retry should re-attach the
      strand (or wait on `strand:writable`), not re-run formation.
