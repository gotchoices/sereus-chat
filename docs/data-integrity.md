# Data integrity: authorship, order and history

**Status: proposal for a possible future upgrade. Not adopted, nothing implemented.** Chat is
informal today: its conversation record makes no claim to be evidence of anything (§5.1). This
document records what a provable record would protect against, the method that would be used, what
the Sereus stack already provides, and the work it would take, so the upgrade can be weighed and
picked up later. Everything below written as what chat "does" describes chat *if* the upgrade is
adopted.

Related: [app-family.md](app-family.md) (where the code lives),
`design/specs/domain/schema.md` → *Ordering* (the open question this would settle),
[gotchoices/sereus#5](https://github.com/gotchoices/sereus/issues/5) (Sereus's answer on
ordering).

---

## 1. The need

### There is no referee

A strand has no server and no authority. Each member's machines hold a copy of the
conversation and write to it directly. Anything the record says about who wrote what, when, and
in what order is, today, simply what some member's device put there. In a dispute, nothing in
the data can settle it.

### What can go wrong

| # | Attack | Example |
|---|--------|---------|
| T1 | **Impersonation** | A member inserts a message attributed to another member. |
| T2 | **Alteration** | A member rewrites someone else's message. |
| T3 | **False date** | A member backdates their own message to make it look like it came before something. |
| T4 | **Doctored restore** | A member backs up the strand, edits the backup (adds lines the other person never wrote, changes dates), and restores it. |
| T5 | **Silent removal** | A member deletes or omits messages from their copy. |
| T6 | **Two stories** | A member shows different histories to different people. |
| T7 | **Rewritten edits** | An edit replaces the original with no trace of what was first said. |

### Where chat stands today

- **Nothing in the chat schema is cryptographic.** `design/specs/domain/chat-sapp.qsql` has no
  signature, key or hash column.
- **Authorship is a plain column.** `Message.MemberId` is whatever the writer puts there. It
  holds the writing machine's libp2p peer id (`packages/core/src/sereus/strands.ts:96-101`), so
  any member's node can write a row under another member's id (T1), and one person with two
  machines appears as two members.
- **Time is self-asserted.** `Message.Timestamp` is "asserted by the sender; not authoritative".
- **Edits and deletes overwrite.** `ops.md`: `editMessage` is "in place; no version chain";
  `deleteMessage` "removes the row" (T5, T7).
- **Order has no basis.** `schema.md` → *Ordering* records that there is no authority on timing
  and no usable sequence. Sereus confirmed in sereus#5 that commit order exists in storage but is
  not reachable from SQL, and chat answered that the happened-before route was the one open to
  it. This document works out that route.
- **There is no backup or restore.** The need for one (including across schema versions) is what
  makes T4 urgent: the moment a restore exists, it is an attack surface.

### Goals of the upgrade

1. **Nobody can put words in another member's mouth** (T1, T2, T4 for others' messages), live or
   through a restore.
2. **Order is provable as "what each author had seen"**, and every honest client derives the same
   order from the same data.
3. **False dates are bounded and detectable**, not silently believed (T3).
4. **History is append-only**: edits and deletes are new statements, and the original remains
   provable (T7).
5. **Forks and gaps are detectable and provable** (T5, T6).
6. **Offline writing merges** without a coordination round.
7. **Backup, restore and schema changes cannot weaken any of the above.**

### Non-goals and hard limits

- **Absolute time cannot be proven** inside a group of parties who may lie. Only bounds can
  (§2.5), unless an outside timestamp is added (§2.14).
- **Withholding cannot be prevented.** A member can always refuse to share something. The method
  makes absences *visible*, not impossible.
- **A member can always lie about their own message at the moment they write it.** Signatures
  prove who said something and what they had seen, not that it was true.

---

## 2. The method

The established pattern for this problem is a **signed hash DAG**: every statement is signed by
its author and names the hashes of the statements its author had already seen. Prior art: Matrix
(`prev_events`), Secure Scuttlebutt (per-author signed feeds), Merkle-CRDTs (OrbitDB), Git
commit graphs, Certificate Transparency (append-only proofs).

### 2.1 Every write is a signed entry

Every change to the conversation is an **entry**: an immutable, signed statement. The signed
part, the **envelope**, contains:

| Field | Meaning |
|-------|---------|
| `Domain`, `Version` | Constant tag, e.g. `'chat.Entry'`, `'v1'`. Keeps a signature from being replayed in another context. |
| `StrandId` | Binds the entry to this strand, so it cannot be lifted into another. |
| `Kind` | `message`, `edit`, `delete`, `react`, `unreact`, `profile`, `checkpoint` |
| `AuthorKey` | The author's member public key (§2.10) |
| `Seq` | The author's own counter: 1, 2, 3, … per author per strand |
| `Parents` | The ids of the entries the author had seen as latest (§2.2) |
| `ClaimedAt` | The author's clock. A claim, not a fact (§2.5). |
| `Body` | Kind-specific content: text, reply target, attachment references, the target entry of an edit, … |

- **The entry id is the envelope's hash.** Content-addressed ids make every reference a
  commitment to exact content, and they replace today's UUIDs. Two writers can no longer pick
  the same primary key for different rows, which also removes the silent last-writer-wins
  hazard noted in `chat-sapp.qsql`.
- **The signature covers the envelope hash**, with Ed25519 over the member key.
- **Hashing uses one framing everywhere.** The crypto SQL plugin's variadic `digest(...)` already
  frames its arguments unambiguously; chat's TypeScript must produce byte-identical hashes, pinned
  by shared test vectors.

### 2.2 Entries are hash-linked

- `Parents` lists the current **heads**: the entries nothing yet points to, as the author's device
  saw them. Normally that is one entry. After concurrent or offline writing it is two or more,
  and the new entry merges them.
- Each author's `Seq` chain sits inside the shared graph. So there are not separate per-member
  chains to keep in agreement: the per-member chains *are* the shared DAG, viewed by author.
- **Every entry signs everything it builds on**, by transitivity through the hashes. A reply is
  therefore the replier's signed statement that they had seen everything before it. That is the
  "agreed to by the parties" record, with no separate signing step.

### 2.3 Readers verify

The writer's machine runs the writer's code, so **no check on the writing side protects anyone
from that writer**. Every client therefore verifies what it receives:

1. The id matches the hash of the envelope.
2. The signature verifies against `AuthorKey`.
3. `AuthorKey` was a member of the strand.
4. Every parent is either held and valid, or recorded as missing (§2.7).
5. `Seq` does not repeat for this author (§2.7).

Results are cached on the device, so each entry is verified once. Entries that fail are never
shown as normal messages. Writer-side CHECK constraints (§3) are still worth having: they stop
honest-but-buggy writers, and they become real enforcement once the stack validates writes
across the cohort.

### 2.4 Order without a consensus round

Consensus on order needs no protocol, only consensus on data (which replication already gives)
plus a **deterministic ordering function**. Every client that holds the same valid entries
computes the same display order:

- a topological sort of the DAG (an entry always follows its parents),
- ties between concurrent branches broken by `ClaimedAt`, then by entry id.

Concurrent branches are genuinely concurrent: neither author had seen the other's entry. The
tie-break only makes the display stable; it claims nothing about which came first.

### 2.5 Time: bounds, not certainty

- An entry cannot have been written **before** any entry it names (its parents and their
  ancestors).
- It must have existed **before** any entry that names it.
- A `ClaimedAt` outside that window is provably wrong, assuming the neighbours' clocks are honest.
  The app marks such entries rather than believing them.
- Each device also records, privately, when it first received each entry. That is evidence for
  the device's own user and never part of the shared record.

In a two-person strand this is the best available without an outside clock. Schemes that take
the median of members' receive times (Hashgraph) need several honest members to mean anything.

### 2.6 Edits, deletes and reactions are entries

- An **edit** is an entry naming its target; it is valid only from the target's author. Displays
  show the latest edit; the original stays provable.
- A **delete** is a tombstone entry from the target's author. Displays hide the target; the
  record keeps both. (Whether a deleted message's *content* may be purged from storage is a
  separate privacy decision, see §5.3 Q3.)
- **Reactions** and **profile** changes (display name, avatar) are entries too, so they are
  attributable and cannot be forged.

### 2.7 Forks and gaps

- **Equivocation:** two different valid entries from one author with the same `Seq` prove the
  author told two stories (T6). Both entries are signed by the author, so the pair is
  self-contained evidence. The app shows it as such.
- **Gaps:** a parent id that no copy can produce is a visible hole. It shows that something was
  written and is being withheld (T5), and by whom: the gap is in a specific author's chain, or
  is named by a specific entry.

### 2.8 Offline writing and merge

An offline member keeps writing against the heads they last saw. On reconnecting, both sides'
entries replicate, and the next entry from anyone names the heads of both branches, merging
them. No conflict resolution is needed for append-only signed entries, because entries never
overwrite each other.

### 2.9 Backup, restore and schema change

**The signed envelopes are the record. Tables are a projection of them.**

- **Backup** exports the envelopes and signatures.
- **Restore** imports them through the same verification as live replication. Forged or altered
  entries are rejected (T4). Omitted entries are filled in by the other members' copies. Deletes
  survive as tombstones.
- **Schema change** rebuilds the new tables from the same envelopes. No signature covers a table
  layout, so none needs re-signing. A new envelope `Version` is added alongside the old one, and
  readers keep verifying old versions.

### 2.10 Keys

- **Sign with the member key, not a machine key.** On a closed strand each party already has a
  per-strand key: `StrandPartyKey`, published as `Strand.Member.Key`. Using it means one person
  with several machines is one author, and membership checks (§2.3 step 3) can use Sereus's own
  member records. `Member` in the chat schema would become keyed by member key, not peer id.
- **Every machine of the party must be able to sign.** Today the key comes from
  `CadreNode.ensureStrandPartyKey`, which needs an owner signer. A member-signer seam usable on
  any of the party's machines is a Sereus gap (§3).
- **Open strands have no member keys.** Sereus does not create `Member` rows for open strands
  (ticket `feat-open-strand-witness-policy`). Until it does, an open strand can use a key the app
  generates per party per strand and announces in a signed `profile` entry. That still gives
  tamper evidence and consistent authorship within the strand, but nothing outside the strand
  vouches for who the key belongs to.
- **Key rotation and departure:** old public keys stay in the record, so old entries keep
  verifying. A removed member's later entries are invalid from the removal onward.

**Signing many messages does not weaken the key.** Ed25519 is deterministic: the per-signature
nonce is derived from the key and the message, so the nonce-reuse failure that broke ECDSA keys
cannot happen. Its security proof already assumes an attacker who sees signatures on as many
chosen messages as they like, short or long. The domain tag (§2.1) is what keeps signatures from
being reused across contexts.

### 2.11 Cost

- Hashing is microseconds; cadre-rn already routes SHA-256 to native code.
- Ed25519 signing and verifying take single-digit milliseconds in pure JavaScript on Hermes (an
  estimate, likely near 10 ms on the S7). A send already waits most of a second for its network
  commit.
- Verification runs once per entry, on arrival or restore, and is cached.
- `sign`, `verify` and `digest` already exist as SQL functions in every strand database.

### 2.12 Why existing encryption does not substitute

Transport encryption (Noise) authenticates each connection with a symmetric key that both ends
hold and that disappears when the connection closes. It cannot show *which* end wrote something,
it is never stored, and it cannot survive a backup. The storage layer's signatures (§3) are made
with machine keys over storage blocks, and apps cannot see them. Neither proves authorship of a
message.

### 2.13 Deniability: a decision to make first

A signed message is **transferable proof**: any member can show anyone, verifiably, that you
wrote it. Signal and OTR deliberately avoid this by authenticating with shared secrets, so that
either party could have produced a message. An "unarguable record" and "plausible deniability"
are opposites. The upgrade means choosing the record, which would suit communication among
trusted peers that need a dependable history. Adopting it is that choice, and it should be explicit
and stated to users (§5.1).

### 2.14 Optional: outside time anchoring

If absolute time ever matters (for example, legally), a member can periodically anchor the
current heads' hash with an outside timestamp service (RFC 3161, or OpenTimestamps on a public
chain). The anchor proves the whole history up to those heads existed by that time. It is
optional and not required by any goal above.

---

## 3. What Sereus provides today

Investigated across sereus, optimystic and quereus (source, docs, tickets and issues).

**Verdict: partially.** The stack has the building blocks but no facility that is author-signed,
hash-linked, tamper-evident and multi-party mergeable at once. If adopted, chat would build the
entry log in its own schema with existing primitives, and ask Sereus for two small seams.

| Mechanism | Author-signed | Hash-linked | Append-only / tamper-evident | Multi-party + offline merge | Status |
|---|---|---|---|---|---|
| Optimystic **Diary** (`db-core/src/collections/diary/`) | ✗ entries carry no author or signature | partial: each log block stores `priorHash` of its predecessor (`db-core/src/log/log.ts:287-299`), but nothing in production checks it | partial: append-only API; invalidated entries still returned by `selectLog` | ✗ one linear log; concurrent appends rebase; a partition fork resolves to the higher revision | Low-level API only; not reachable from SQL or strands; unused by Sereus |
| Per-collection **transaction log** (under every table) | ✗ | partial (same `priorHash`) | partial | partial; commit order not readable from SQL (sereus#5) | Wired, internal |
| **Client transaction signature** (`db-core/src/transaction/transaction.ts`) | ✗ machine libp2p key; strand SQL commits are unsigned | ✗ | ✗ not kept after commit | n/a | Built, not wired |
| **Pend-time validator** (`createQuereusValidator`) | could check client signatures | ✗ | would enforce CHECKs cluster-wide | n/a | Built, not deployed (`feat-no-deployment-validates-transactions-at-pend`) |
| **Commit proofs** (`db-p2p/src/cluster/commit-proof.ts`) | ✗ cohort machine keys over block content | ✗ | partial, for storage blocks | n/a | Wired, internal |
| **Crypto SQL functions** (`quereus-plugin-crypto`: `digest`, `sign`, `verify`, `cid`) | ✓ building block | ✓ building block | partial: a CHECK runs only on the writing machine | depends on schema | **Wired in every strand DB** |
| **Sereus schema idioms** (`schemas/strand.qsql`) | ✓ pattern: `verify(digest(...), sig, key, 'ed25519')` in a CHECK | ✗ | `InsertOnly check on update, delete (false)` | insert-only tables converge | **Wired** |
| **Strand-contracts** signatures and postings (`docs/strand-contracts.md`) | ✓ stored, member-key signed | ✗ | ✓ insert-only | ordering left open | **Design only** |

What this means for chat:

- **Usable today:** the crypto SQL functions, the CHECK-with-`verify` idiom and the insert-only
  idiom. Chat's entry table would be built from these.
- **Writer-side only, for now:** replicas apply committed data without re-running CHECKs, and no
  deployment validates writes at pend. So the reader verification in §2.3 is the actual
  guarantee until Optimystic turns validators on.
- **Not suitable:** Diary. Making it fit would mean author signatures, checked `priorHash`,
  exposed metadata and SQL integration, and it would still be a linear consensus log rather than
  a mergeable DAG.
- **Missing in the stack:**
  - a **member-signer seam**: sign with this party's member key for strand X, on any of the
    party's machines (today `ensureStrandPartyKey` is owner-gated; tickets `1.01`/`1.02` cover
    owner keys only);
  - a SQL way for a schema to check that a key is a current member (to confirm whether an sApp
    schema can reference `Strand.Member` in a CHECK);
  - member keys on **open** strands (`feat-open-strand-witness-policy`).
- **Already proposed upstream:** a shared causal-history facility for sApps
  (`sereus/tickets/backlog/feat-shared-causal-history-for-sapps.md`, unscheduled), raised from
  chat's own question in sereus#5. Chat's implementation can serve as its prototype. Related:
  `tickets/blocked/expose-commit-order-to-sql-decision.md`.

---

## 4. Implementation and migration plan, if adopted

Not scheduled. The plan assumes the app-family structure: the protocol in `packages/core/protocol`, the model in
`packages/core/sereus`, stores in `packages/core/stores`. Every app (mobile, mobile-ns, web, cli)
gets it through the core.

**Existing data is not migrated.** There is no installed base; testers wipe. The switch bumps the
data-format marker, and old strands are left behind.

### Phase 0: decisions

- [ ] Informal or record, and whether the founder chooses per strand (§5.1); deniability
      follows from it (§2.13). State it in `design/specs/project.md` and to users
- [ ] The design questions in §5.3, Q1–Q8 at least, since they change the schema
- [ ] Open-strand authorship until Sereus has member keys there (§5.3 Q12)

### Phase 1: domain contract

- [ ] `schema.md`: replace *Ordering — placeholder* with this model; `Member` keyed by member key
- [ ] `ops.md`: edit, delete and react become entries; reads return verification state
- [ ] `chat-sapp.qsql`: an insert-only `Entry` table (id, kind, author key, seq, claimed time,
      body, signature, envelope version) and an insert-only `EntryParent` link table; CHECKs that
      the id is the envelope hash and the signature verifies; membership CHECK if the schema can
      reach `Strand.Member`
- [ ] Bump the sApp version and the data-format marker

### Phase 2: protocol (`packages/core/protocol`)

- [ ] Envelope type, canonical encoding with the `digest` framing, id computation
- [ ] Sign and verify functions
- [ ] Test vectors shared by the TypeScript and SQL paths (same bytes, same hash)
- [ ] Ordering function (§2.4) and time bounds (§2.5), as pure functions with tests

### Phase 3: member signer

- [ ] Ask Sereus for the member-signer seam (§3), referencing
      `feat-shared-causal-history-for-sapps`
- [ ] Interim: the host obtains the party's strand member key through `ensureStrandPartyKey`
      on owner machines; a `ChatHost.signer(strandId)` hides how
- [ ] Open strands: the interim per-party app key (§2.10)

### Phase 4: write path

- [ ] Track local heads and the author's `Seq` per strand (device-local state)
- [ ] `send`, `edit`, `delete`, `react`, `unreact` and profile updates write signed entries
- [ ] Re-test send latency on the S7 and the S21 (signing must stay well under the commit time)

### Phase 5: read path

- [ ] Verify each entry on arrival; cache results per device
- [ ] Project entries into the messages, reactions and members the stores already expose
- [ ] Verification states in the model (`valid`, `invalid`, `pending-parents`,
      `time-out-of-bounds`) and how each UI shows them, with strings in `packages/resources`

### Phase 6: forks and gaps

- [ ] Detect duplicate `(author, Seq)` and keep both entries as evidence
- [ ] Detect missing parents; show which author's chain has a hole

### Phase 7: backup and restore

- [ ] Export: envelopes and signatures, plus the strand's membership keys
- [ ] Import: through the Phase 5 verification, merging with what peers hold
- [ ] Contract-suite test: a doctored backup (inserted, altered, back-dated entries) is rejected
      or flagged, and the honest record survives

### Phase 8: hardening

- [ ] When Optimystic deploys pend-time validators, confirm chat's CHECKs are enforced
      cohort-wide
- [ ] Optional `checkpoint` entries for members who read without posting
- [ ] Optional outside time anchoring (§2.14)
- [ ] If Sereus builds the shared causal-history facility, move chat onto it

---

## 5. Decisions and open questions

§§2–4 describe chat keeping a provable record, which it does not do today. Adopting the upgrade
starts by deciding that it should (§5.1), then settling the design questions that change the
schema (§5.3).

### 5.1 The first decision: informal or record

**Chat is informal today**, and stays so unless this upgrade is adopted.

| | **Informal** | **Record** |
|---|---|---|
| Promise to users | A convenient conversation. Not evidence of anything. | Who said what, after seeing what, cannot be forged or quietly changed. |
| Edits and deletes | Overwrite and remove, as today | New entries; the original stays provable |
| Deniability (§2.13) | Kept, in practice: nothing is signed | Given up: every message is transferable proof |
| Cost | None | Signing per send, verification per entry on join and restore, larger strands |
| Depends on Sereus | Nothing new | A member signer (§5.3 Q1); cohort-wide validators for full enforcement |

**A per-strand choice.** The founder could pick the mode when founding, as part of the strand's
terms, shown to invitees before they join and fixed for the strand's life. That lets casual
conversations stay light and deniable while others keep a record. The mode would have to live in
something invitees can verify (the sApp version or the strand's terms), not in a setting one
party could flip.

**What "record" still would not give**, even fully built:

- **Real-world identity.** A key proves the same party wrote every entry signed with it, not
  which person that party is. Tying a key to a person is outside Sereus.
- **Absolute time**, unless anchored externally (§2.14).
- **Admissibility.** Whether a court accepts such a record is a legal question. Tamper evidence
  helps but does not settle it.

So "record" can honestly promise *tamper-evident and attributable within the strand*. It should
not be presented to users as a *legal record*.

**Impersonation is a problem even in informal mode.** Today any member's node can write a message
under another member's id (T1). Signed authorship alone (no hash links, edits and deletes still
allowed) would close that without giving up the informal model's simplicity. It may be worth
doing regardless of the choice above.

### 5.2 Answers to review notes

**Can any device holding an owner key sign?** Partly.
- A party may hold several owner keys (one per device through owner grants, or one key imported
  onto several devices), and any of them can be the signer.
- Other parties cannot see a party's owner keys, though. Those live in the party's own control
  database. What other members know is the party's member key (`Strand.Member.Key`). So an owner
  key must first be introduced into the strand by an entry signed with the member key, binding it
  to the party.
- The member key's private half, `StrandPartyKey.PrivateKey`, is a row in the control database,
  which replicates to every machine of the party. That includes storage-only drones and rented
  nodes (to confirm with Sereus). So the member key is already usable on any party machine once
  an owner has created it. Signing with owner keys instead keeps authorship to the devices the user
  chose. Either way, the member key is the trust root other parties check.
- Drones need no signing ability. Phone, laptop and desktop each sign if each holds an owner key.

**Is data really deleted under the hood?** Not from storage, but that is no help as evidence.
- Optimystic keeps every block's forward transforms indefinitely (`optimystic/docs/repository.md`).
  So a row deleted through SQL still sits in block history on the machines that held the block.
- Applications cannot reach that history through SQL (sereus#5). It carries no author signature,
  only machine keys over storage blocks. And it lives only on the machines in that block's cohort,
  which may all be the deleting party's.
- So it is recoverable forensically, at best, not provable. It also means a delete in today's
  chat does not truly erase, which matters for what a delete promises users (Q3).

**Can tables be declared append-only?** Yes, as written; not yet as enforced.
- Sereus's `InsertOnly check on update, delete (false)` idiom works in the chat schema.
- Today only the writing machine runs CHECKs. Replicas apply committed data without re-running
  them, and no deployment validates writes at pend (§3). So a hostile node's `DELETE` still
  replicates.
- Until validators run, append-only must also be enforced by each device keeping its own copy of
  the entries it verified (Q4).
- A user can still delete their own post under the record model: the delete is an entry that
  hides the message (§2.6). The open choice is whether its content is also purged (Q3).

### 5.3 Design questions to settle before Phase 1

Each of these changes the schema or the requests to Sereus.

1. **Who signs, and how others verify it.** Options:
   - the party's member key on every party machine (available today; drones and rented nodes
     hold it too);
   - owner keys, each introduced by a member-key-signed `key` entry (limited to the user's chosen
     devices; adds an entry kind and a revocation path for a lost device).

   Recommended: owner keys introduced by the member key. Either way, ask Sereus to confirm where
   `StrandPartyKey.PrivateKey` replicates.
2. **Chains per device, not per author.** Two devices signing with one key (an imported owner key,
   or the shared member key) both write `Seq` *n* while offline. §2.7 would report that as
   equivocation by an honest user. The chain should be `(SigningKey, DeviceId, Seq)`, with
   `DeviceId` in the signed envelope. Equivocation then means two entries with the same triple.
3. **What a delete promises.**
   - Hide only: the signed content stays; it can always be proved.
   - Purge: possible without breaking the chain if the envelope signs `BodyHash` and the body is
     stored separately. Purging the body then leaves signatures and links checkable, but the
     content is gone.

   Recommended: sign `BodyHash` either way, so the choice can be per strand or changed later.
   Attachments follow the same pattern: the hash in the signed entry is enough.
4. **Protection against deletion before validators run.** A hostile node can delete `Entry` rows
   from the shared store. Reader checks cannot see a row that is gone, and the newest entries
   leave no gap behind. Each device should therefore keep an append-only local archive of the
   entries it has verified. That archive, not the shared tables, is what backups export and what
   proves a removal.
5. **Hashing `Parents` and `Body`.** The id hashes the envelope, which includes `Parents`. A CHECK on
   `Entry` cannot hash rows in a separate `EntryParent` table. So `Parents` goes in `Entry` as one
   canonically encoded column (sorted), with `EntryParent` only as an index. `Body` needs a
   canonical encoding too (canonical CBOR or canonical JSON), pinned by the shared test vectors.
6. **Where derived tables live.** If messages, reactions and members are shared tables, a hostile
   writer can write fake rows straight into them and bypass the signed entries. They should be
   device-local or SQL views over verified entries, never shared tables that people write to.
7. **Membership over time.** "Invalid from the removal onward" (§2.10) has no meaning in a graph
   without a global order: a removed member can keep signing entries that name old parents.
   Options:
   - record membership changes as entries in the graph (as Matrix does);
   - require each entry to name the current membership epoch;
   - rely on Sereus cutting off a removed party's access, and state that.
8. **Validity rules beyond §2.3.**
   - An author's entry must descend from that device's previous entry, so a chain cannot quietly
     split.
   - `ClaimedAt` is clamped to its proven bounds before it breaks ties (§2.4), so an author cannot
     sort first by claiming an early time.
   - Goal 2 proves only what an author had *at least* seen. Naming older heads hides awareness and
     widens the author's time window. The document and UI should say so.
9. **Cost on join and restore.** Verifying ~10 ms per entry on the S7 makes 1,000 entries take
   ~10 s, on top of joins already measured at 25–40 s. Extra rows also mean more blocks fetched on
   attach (Optimystic#39). Before committing, measure: native Ed25519, verifying the newest entries
   first, and checkpoints a joiner can trust instead of re-verifying all history.
10. **Late branches in the UI.** A branch written offline sorts by the DAG, so its messages can
    appear above ones the reader already saw. Decide how the UI marks them.
11. **Flooding.** A member can fill a strand with entries that fail verification. Readers reject
    them but still fetch and check them. Decide whether to limit this per author, or accept it until
    pend validators exist.
12. **Open strands.** Sereus gives them no member keys. Is an app-generated per-party key, announced
    in a signed entry, good enough there (trust on first use)? Or does record mode require a closed
    strand?
13. **Membership check in SQL.** Can a chat sApp CHECK reference `Strand.Member`, or does membership
    checking live only in the reader?
