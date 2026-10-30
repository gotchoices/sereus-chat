# Asynchronous writes (offline mode) — plan

**Status: plan, nothing built.** Adopts sereus 1.19.1 / optimystic 1.20.1 / quereus 4.21.1 and
their strand *offline mode*, so a send returns as soon as the phone has saved it and the
conversation shows each message's delivery state. Written 2026-10-29 from:
- sereus `docs/strands.md` (v1.19.1): "A commit's durability" and "Offline mode";
- `docs/reference-app-rn.md`: "Messages Not Yet Delivered";
- the sereus 1.19.1 release notes;
- a read of the health app's adoption (its committed W6 stand-in and its uncommitted move to
  the stack's queue).

Related: [STATUS.md](STATUS.md) (Phase 7d), [app-family.md](app-family.md).

---

## 1. What the stack now offers

### Durability reports (already in the stack we run)

- A commit's durability: `strand.database.commitDurability(Tx)`, where the write is a single
  statement `insert … returning StampId() as Tx`.
- `heldElsewhere` answers "does this survive my phone being lost".
- The node emits `strand:commit-durability` for every commit, and `strand:commit-held` once
  every cohort member holds a commit that was followed.
- Chat uses none of this today.

### Offline mode (new in 1.19.1)

**What a local commit promises.**
- A strand commit resolves once the transaction is saved in the strand's journal on this
  machine.
- The journal is sent later, in order, and the strand is never committed alone while known
  members are unreachable.
- It survives restarts, and an interrupted send lands once.
- It does not promise the members will accept it. A queued transaction can still fail, and
  its rows then leave the local view.

**The queue's statuses.** `strand:offline-status` reports these per transaction:
- `queued` (with `persisted`, `outlook: assured | exposed`, `waitingFor`)
- `submitting`
- `partially-committed`
- `committed`
- `failed`, with a reason: `constraint`, `concurrent-modification`, `rejected`, `too-large`,
  `expired`, `discarded`.

`strand:queue-state` reports the queue's state and mode.

**The app's handle.** `strand.database.offline` gives `status(Tx)`, `entries()`, `discard`,
`acknowledge`, `whenDrained`, `outcomes`.

**Turning it on.**
- On the phone kit: `strandOfflineMode` (a start option, saved with the start options), and
  `setStrandOfflineMode(mode)` at runtime.
- On a bare `CadreNode`: `CadreNodeConfig.strandOffline = { journal, initialMode }`.

**Where it is not offered.**
- NativeScript, which has no journal (`StrandOfflineUnavailableError`).
- The always-on programs.
- The control database.

**Sereus's own `Strand` tables are always network-acknowledged.**
- A transaction touching them waits for the network.
- Membership writers refuse with `StrandOfflineQueueBusyError` while the queue holds
  anything, and retry.
- `forgetJoinedStrand` and `unpublishStrand` refuse with `StrandQueueNotEmptyError`
  unless `discardQueued: true` is passed.

**Fresh keys.** An app-generated key tagged `"optimystic.fresh" = true` makes an insert
`assured`, meaning no other writer can make it fail.

**Upgrade rules.** Every machine of a strand must move to 1.20 together. Offline mode must
stay off until all of them have.

## 2. What health did (lessons, not code to copy)

Health has done this before us. Its working tree (uncommitted) does the following:

- **Mode:** offline mode is on from the start, through a bare `CadreNode` with
  `strandOffline: { journal: LevelDBKVStore per strand, initialMode: 'offline' }`.
- **Transaction id:** every write reads `StampId()`.
- **Tracking:** pending changes are tracked by transaction id, and the txId-to-record map is
  persisted to AsyncStorage so markers survive restarts.
- **Per-record marks:** "On this device only" and "Saving".
- **App-wide line:** "N waiting to sync".
- **Failures:** "Not saved" with the reason, dismissed through `acknowledge`.
- **Spec rules:**
  - states only move forward;
  - nothing is reported "not saved" silently;
  - no nodes is normal, not an error;
  - the app shows the states but doesn't compute them.

Weak spots worth avoiding:

- **Statuses before the id is known.** In offline mode the first status arrives inside the
  commit, before the app has the transaction id. Health buffers early statuses in a
  64-entry map that can evict. Better: follow the reference app, and read `offline.status(Tx)`
  right after the statement returns, in the same step that records the mark.
- **Restore depends on a ready database.** Health restores before the strand database is
  ready, and treats an unknown status as settled. Better: re-read the recorded transactions
  on each `strand:queue-state` publication, as the reference app does.
- **A commit that nothing follows stays "pending" forever.** Show it as "not confirmed
  delivered", not as stuck.
- **`partially-committed`, `inDoubt` and `waitingFor`** are not handled.

## 3. Upgrading chat to the new stack (needed with or without offline mode)

- **Pins:** in `scripts/use-stack.sh`, sereus 1.19.1, optimystic 1.20.1 and quereus 4.21.1.
  Then `bash scripts/use-stack.sh npm --install`.
- **No data wipe.** 1.19.0 stores open on 1.20 without migration. `DATA_FORMAT` stays.
- **Every tester moves together.** A 1.19.x writer refused through a 1.20 coordinator
  doesn't recognise the refusal. Never turn offline mode on until everyone runs this build.
- **Errors by type, not text** (`packages/core/src/sereus/errors.ts`, and
  `retryAfterRestart` in `model.ts`):
  - **`BlockUnavailableError`** (`Block … is unavailable (peers-unreachable)`) replaces
    "Some peers did not complete". Today's `UNAVAILABLE` regex misses it, so it would surface
    as `unexpected`.
  - **`PromiseShortfallError`** keeps the "Failed to get super-majority" text, so the
    current retry still matches it. Match the type anyway.
  - **`ValidityRejectedError`** is a permanent refusal. Don't retry it.
  - **`classifyCommitFailure`** (`@optimystic/db-core`) can replace the regexes.
- **Leaving:** handle `StrandQueueNotEmptyError` (only possible with offline mode on). See
  §4.4.
- **NativeScript** gets the same pins. It has no offline mode, and its storage still fails on
  Android 8 (unchanged).
- **Check:** core, serchat unit tests and scenarios, `formation-cost.mjs`,
  `message-latency.mjs`, and type checks for all apps.

## 4. Making chat asynchronous

### 4.1 One delivery model in the core, whatever the mode

Each of the user's own messages carries a delivery state, from the transaction it was written
in. The rules are the reference app's (`send-marks.ts`):

| State | From | Shown as |
|---|---|---|
| `waiting` | `queued` (offline mode) | "Waiting to send". Adds "May not go through" if `outlook` is `exposed`. |
| `sending` | `submitting`, `partially-committed` | "Sending" |
| `here-only` | committed, `heldElsewhere` false | "Not yet delivered" |
| `delivered` | `heldElsewhere` true, or `strand:commit-held` | nothing (the normal case) |
| `unconfirmed` | committed, not held elsewhere, `followed` false | "Not confirmed delivered" (never "stuck") |
| `not-sent` | `failed` | The row leaves the list. A line names it with the reason until dismissed (`acknowledge`). |

These are the same states in both modes. In online mode a send simply resolves later, already
at `here-only` or `delivered`. That is what makes a mode switch cheap (§6). Other people's
messages have no state.

### 4.2 Core changes (`packages/core`)

**Model types (`model/messages.ts`).**
- `Message.delivery?`, plus `mayFail?` for an `exposed` outlook.
- `StrandState` gets the queue figures: waiting count, waiting for members, showing saved
  copy.
- A `ChangesModel` signal for delivery changes. The strand signal could also carry them.

**Writes (`sereus/operations.ts`).**
- A message is one transaction: the message insert `returning StampId() as Tx`, plus its
  attachments.
- Today message and attachments are separate commits, so a send can land half done.
- Edits, deletes and reactions return their transaction id too.

**Tracking (`sereus/model.ts`).**
- Subscribe once to the node events: `strand:offline-status`, `strand:queue-state`,
  `strand:commit-durability`, `strand:commit-held`.
- Keep a map from transaction id to message (persisted). A new local-state slot,
  `queuedMessages`, holds the transaction id, strand, message id, kind and time.
- On each `strand:queue-state` publication, and at start for strands already published,
  re-read each recorded transaction's `offline.status`. Mark from it, and drop the settled
  ones.

**Failures.**
- A `not-sent` list in the chat view; dismissing it calls `offline.acknowledge`.
- `failed` with `committedCollections` (a transaction half committed) reloads the
  conversation.

**Discard.** A waiting message with `inDoubt` false can be withdrawn (`offline.discard`).
`EntryNotDiscardableError` is shown as "Already being sent".

**Leave.** On `StrandQueueNotEmptyError`, return a new `ChatFailure('unsent-messages')` naming
the count. The UI asks, then calls leave again with `discardQueued: true`. That needs a
`discardQueued` option on `strands.leave`.

**Registration.** `registerSelf` writes `App.Member` (an `App` table), so offline mode
acknowledges it locally. Good. The `queryMembers` fallback read in `send` becomes rare.

**Store (`stores/chat.ts`).**
- The pending "Sending…" row resolves in milliseconds in offline mode, then shows its mark.
- Merge delivery marks into `ChatView.messages`.
- Expose `notSent` and the queue line.

### 4.3 Schema (`design/specs/domain/chat-sapp.qsql`: a human spec, needs your consent)

- Tag `Message.Id` and `Attachment.Id` `"optimystic.fresh" = true`. Both are app-generated
  UUIDs, so a message insert is judged `assured` (no "May not go through").
- `Member` (peer id), `Reaction` (composite key) and `Reaction`'s `insert or ignore` stay
  untagged.
- Bump the sApp version.
- The stack defers an app schema upgrade while the queue holds transactions that wrote the
  table, and applies it on drain (`appSchemaState`). Nothing to build for that.

### 4.4 Apps

**RN (`apps/mobile`).**
- Pass `strandOfflineMode: 'offline'` to `createPhoneNode`, through `CadreService` options.
  The kit supplies the journal in each strand's LevelDB.
- Message bubble: the marks from §4.1, with strings in `packages/resources`.
- Conversation header: the queue line, e.g. "2 waiting to send · waiting for the other
  members".
- Not-sent line with dismiss; Discard on a waiting message.
- Leave prompt for unsent messages.
- The composer no longer waits, so the "Sending…" spinner disappears in offline mode.

**NativeScript (`apps/mobile-ns`).** No journal, so it stays online (synchronous). It still
gets the online marks ("Not yet delivered"), because those come from durability reports. Good
as the engine-comparison twin.

**CLI (`apps/cli`).** See §5.

**Specs.** Chat's own specs describe synchronous sends: `interfaces.md` ("Cohort offline →
writes stay local") and `ops.md` (send semantics). They need the same rewrite health did.
They're human specs, so that needs your consent.

### 4.5 Order of work

1. **Stack upgrade (§3).** No behaviour change. Test CLI to CLI.
2. **Delivery marks in online mode.** Core plus the CLI print-out. Testable now in Node
   (`here-only`, then `delivered` when the other party connects).
3. **Offline mode plumbing in the core**, plus serchat `--offline` with Node scenarios:
   - queued while the peer is down, delivered once when it returns;
   - survives a restart;
   - a refused transaction becomes `not-sent`;
   - leave with unsent messages.
4. **RN:** switch it on, the marks UI, queue line, not-sent, discard, leave prompt.
5. **Schema tags and spec updates** (with consent).
6. **Phone testing,** when you clear it.

Steps 2 and 3 carry most of the risk, and both are fully testable CLI to CLI.

## 5. Keeping the CLI synchronous

Yes, and it's the default with no work. serchat builds its own `CadreNode` (`apps/cli/src/host.ts`).
Offline mode exists only when `strandOffline` is passed, and the stack's own always-on programs
deliberately pass none.

- **Default (synchronous):** `messages send` resolves when the cohort takes the commit, as
  today, so its timing is the backend's real cost. The perf work, `formation-cost.mjs` and
  `message-latency.mjs` keep measuring the same thing. serchat also prints the online marks
  (`here-only` / `delivered`) from durability reports. That is useful by itself.
- **Recommended `--offline` flag:** builds `strandOffline` with a `FileKVStore` journal in the
  serchat home. It lets the CLI scenarios exercise the asynchronous path, which the phones will
  run, without a phone. Off by default.

## 6. A synchronous switch in the GUI

**Feasible and clean, as a developer setting.**
- The stack does the switching: the phone kit's `setStrandOfflineMode(mode)` applies to every
  running strand at once, and is saved with the start options.
- The core's delivery model (§4.1) is the same in both modes. So the app side is one settings
  row plus one call.
- Nothing else branches: the composer just gets its answer later in synchronous mode.

**Caveats.**
- **Turning it off with messages still queued.** Upstream advises leaving the mode on. A
  network-acknowledged commit made while transactions are queued waits behind them, holding
  the database, for up to 5 minutes. So the switch should either be disabled while the queue
  holds anything, or wait for `whenDrained()` before switching.
- **Offline to on** is always safe.
- **Scope:** keep it under a developer/diagnostics screen, not in user-facing Settings.

**Recommendation:** build it in step 4, alongside offline mode. It costs about an hour, and it
lets the same phone compare "felt" speed against backend cost.

## 7. Not letting asynchrony hide slowness

- **The CLI stays synchronous** (§5), and the Node measurements keep measuring commits.
- **The phones log delivery timings** in development builds: queued → submitting →
  committed → held elsewhere, per message, through the existing `[perf]` logging. An
  asynchronous phone then reports how long delivery really took, instead of hiding it.
  `test/devices/devtime.mjs` can collect it.
- **The developer switch (§6)** gives a synchronous phone run when needed.

## 8. Open questions

1. **Specs and schema** (§4.3, §4.4): may I update `chat-sapp.qsql` and the domain specs?
2. **Default:** should RN ship with offline mode on? The reference apps default to off;
   health starts on.
3. **Edits, deletes, reactions:** mark them as well (an edit "waiting to send"), or only
   messages at first?
4. **A failed edit or delete:** the stack takes the change out of the local view. Say so in
   the not-sent line?
