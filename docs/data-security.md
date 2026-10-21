# Data security: authorship, order and history

**Status: design. Nothing here is implemented.** This document records why chat needs
cryptographic protection of its conversation record, the method chosen, what the Sereus stack
already provides, and how chat gets from today's schema to the new one.

Related: [app-family.md](app-family.md) (where the code lives),
`design/specs/domain/schema.md` → *Ordering* (the open question this settles),
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
  not reachable from SQL, and chat answered that it would take the happened-before route. This
  document is that route.
- **There is no backup or restore.** The need for one (including across schema versions) is what
  makes T4 urgent: the moment a restore exists, it is an attack surface.

### Goals

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
  separate privacy decision, see §5.)
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
  member records. `Member` in the chat schema becomes keyed by member key, not peer id.
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
are opposites. This document assumes chat chooses the record, which suits its purpose of
communication among trusted peers with a dependable history. That choice should be explicit and
stated to users.

### 2.14 Optional: outside time anchoring

If absolute time ever matters (for example, legally), a member can periodically anchor the
current heads' hash with an outside timestamp service (RFC 3161, or OpenTimestamps on a public
chain). The anchor proves the whole history up to those heads existed by that time. It is
optional and not required by any goal above.

---

## 3. What Sereus provides today

Investigated across sereus, optimystic and quereus (source, docs, tickets and issues).

**Verdict: partially.** The stack has the building blocks but no facility that is author-signed,
hash-linked, tamper-evident and multi-party mergeable at once. Chat builds the entry log in its
own schema with existing primitives, and asks Sereus for two small seams.

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
  idiom. Chat's entry table is built from these.
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

## 4. Implementation and migration plan

The plan assumes the app-family structure: the protocol in `packages/core/protocol`, the model in
`packages/core/sereus`, stores in `packages/core/stores`. Every app (mobile, mobile-ns, web, cli)
gets it through the core.

**Existing data is not migrated.** There is no installed base; testers wipe. The switch bumps the
data-format marker, and old strands are left behind.

### Phase 0: decisions

- [ ] Deniability vs record (§2.13), stated in `design/specs/project.md` and to users
- [ ] Open-strand authorship until Sereus has member keys there (§2.10)
- [ ] Whether a deleted message's content may be purged from storage, or only hidden (§5)

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
- [ ] Re-test send latency on the S7 and the S20 (signing must stay well under the commit time)

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

## 5. Open questions

1. **Deniability** (§2.13): record or deniability? Everything else assumes record.
2. **Deleting content:** a tombstone hides a message but keeps its signed content. Purging the
   content (keeping only the hash) preserves the chain but loses the proof of what was said.
   Which does a "delete" promise?
3. **Open strands:** is an app-generated per-party key good enough until Sereus gives open
   strands member keys?
4. **Membership check in SQL:** can a chat sApp CHECK reference `Strand.Member`, or does
   membership verification live only in the reader?
5. **Attachments:** the entry signs attachment references by hash; do attachment bytes get their
   own signature, or is the hash in the signed entry enough? (Recommended: the hash is enough.)
