# Sereus Integration

This app sits on top of the Sereus fabric. This file captures the integration contract — what concepts come from sereus, how the app's cadre lifecycle fits, the code-structure boundary that supports a future upstream extraction, and the open project-level decisions. For the operation-level call mapping see [interfaces.md](interfaces.md); for the data we own vs sereus owns see [schema.md](schema.md).

## What sereus provides

Owned by sereus, never redefined in this project:

- **Cadre** — the user's own devices. Provisioned via authority keys and `CadrePeer` rows in the Control DB. Users add and remove cadre nodes (phone, drone, quoomb browser node, …) at any time; the chat app surfaces this, sereus handles the mechanics.
- **Strand** — a P2P database shared with one or more partners. Created via `CadreNode.addStrand(...)`. The user picks open (`'o'`) or closed (`'c'`) per strand at creation; closed strands carry sereus-managed membership/invite/authority overlay tables, open strands don't.
- **Control DB** — per-cadre Optimystic database (`CadreControl` schema). Source of truth for which strands the user has, who else is in the cadre, and authority keys.
- **Invitation / formation protocol** — `OpenInvitation`, `formStrand`, `registerMember`, `validateStrandFormation`.
- **Peer identity** — libp2p Ed25519 keypair, persisted on the device, reused across restarts.

## Cadre lifecycle (this app)

1. **First launch** — app starts a `CadreNode` (transaction profile). Peer identity and party ID are auto-generated and persisted. No authority key, no remote nodes, no networking yet.
2. **Solo phase** — the user can create chat strands locally and read/write the chat schema with no replication. Used for demo, onboarding, and offline.
3. **First remote node** — when the user adds any peer node, an authority key is created and the user's cadre is registered in the Control DB. Data then replicates across cadre nodes.
4. **First partner** — the user generates an `OpenInvitation` or accepts one; the resulting strand is added to the Control DB and joined automatically.

The chat UI never blocks on remote connectivity beyond what the user has explicitly chosen.

## Code boundary (cadre vs chat)

The long-term goal is a React Native UI library — `@sereus/cadre-rn-ui` or similar — providing drop-in Connections / AddNode / AddGuest / Invitation-accept screens shared across sereus apps. A framework-agnostic engine layer is **not** assumed: sereus's existing `cadre-core` API may already be compact enough to consume directly. Only add an engine wrapper if real friction emerges during wiring.

To keep the eventual UI extraction cheap, all chat code is written against this boundary:

- **Cadre layer** (target: `src/cadre/`) — identity, peer/node management, party/cohort state, strand registry, key/seed flows, the Connections / AddNode / AddGuest screens. **Must not import anything chat-specific.** Must support every cadre/strand option sereus exposes (open and closed strands, any node type, any number of nodes).
- **Chat layer** — per-strand `Member`/`Message` schema, message composer/list, attachments, search. May import the cadre layer; the cadre layer never imports back.

A peer effort with the same intent is already underway in [ser/health/apps/mobile](../../../../health/apps/mobile) — see [src/services/CadreService.ts](../../../../health/apps/mobile/src/services/CadreService.ts), [src/screens/SereusConnections.tsx](../../../../health/apps/mobile/src/screens/SereusConnections.tsx), and the matching domain spec [design/specs/domain/cadre.md](../../../../health/design/specs/domain/cadre.md). Align naming and structure with sereus-health where reasonable, so the eventual upstream extraction touches both apps minimally.

## References

- [sereus/docs/architecture.md](../../../../sereus/docs/architecture.md)
- [sereus/docs/reference-app-rn.md](../../../../sereus/docs/reference-app-rn.md)
- [sereus/docs/api.md](../../../../sereus/docs/api.md)
- [sereus/docs/strands.md](../../../../sereus/docs/strands.md)
- [sereus/packages/cadre-core/README.md](../../../../sereus/packages/cadre-core/README.md)
- [sereus/packages/reference-app-rn/src/](../../../../sereus/packages/reference-app-rn/src/)
- Sibling work in [ser/health/apps/mobile](../../../../health/apps/mobile)

---

# Platform reference

Everything below describes **sereus as it is and as it is intended**, not chat's design. It moved
here from the stories and target STATUS files so those can stay as checklists. Stories and
consolidations link here for platform facts.

## Assumptions about sereus strands

What this plan takes as given about strand structure and permissions. Not our design — recorded so
stories stay consistent with it, and so a wrong assumption is visible in one place. Confirmed
upstream except where marked.

- A strand is 2–N parties, backed by a replicated database. Being a member means holding it.
- A private strand has **no owner**. It has *n* **managers**.
- A manager may grant permission to invite members and managers, including to an **existing** member
  (promotion), not only to someone being invited.
- A manager can **remove** members from a strand, **including other managers**. Managers are
  symmetric: nothing privileges the creator, and any two managers can each remove the other. Removal
  stops anything further reaching that member; it does not reach what they already hold.
- **A public strand has no managers at all.** Nobody can be invited, because anyone holding the link
  may join, and nobody can be removed, because nobody holds the ability. It is open in both
  directions and nobody is in charge of it.
- A strand cannot be deleted, only left, unless you are its last member.
- Leaving is always available; the strand continues without you. Nothing happens at the strand
  level when you leave — your cadre simply stops taking part, on your instruction.
- Keeping the key that identifies you in a strand lets you return as the same member later.
  Discarding it is permanent: a later return is as a new member, and your earlier messages stay
  attributed to who you were.
- A strand is public (anyone with the link may join) or private (only invitees).
- There is **no maximum-member setting**. Membership is bounded only by whether a manager exists.
- A manager may invite anyone at any time, and each invitation decides whether its holder becomes a
  manager too.
- A manager may **resign**, at any time, as a manual act. It is never automatic and is not bound to
  invitation processing. Resignation is **recorded on the strand**, so any member can see that a
  strand has no manager, whoever is currently online. It is irreversible.
- **Abandonment is not resignation.** A manager who stops participating, or loses their keys, remains
  recorded as a manager. Nothing distinguishes that from a manager who is merely quiet, and nothing
  can — so a strand in that state still shows that it can grow.
- Resignation removes the *role*, not the person: a resigned manager stays an ordinary member. There
  is no recorded notion of anyone being gone, temporarily or permanently.
- Private nicknames for strand partners are provided by sereus; the named partner need not know.
  Grouping a user's strands across sApps by that private name is intended but not yet available.
- So a permanently two-party strand is made, not declared: create, invite one non-manager, resign.
  Inviting three and then resigning fixes the strand at four. Resignation can happen before or
  after an invitation is taken up.
- If the last manager leaves or loses their keys the strand is **stranded** — no new members or
  managers can be added — but everyone still in it keeps using it normally.
- A new member holds the whole history, including what was said before they joined.
- Deleting a row removes it from the strand database and propagates to every member. It has no
  reach over copies cached or backed up elsewhere.
- A strand carries a member's display identity, not a route to them. No address, no directory, no
  lookup, and generally no way to invite a fellow member directly.
- A strand's agreement may carry confidentiality terms, and may carry enforcement.
- Public strands are a separate case — open join and leave, nothing to administer. Out of scope
  this round.
- **Unconfirmed:** whether permanence ("just us two, forever") is a property members can *see* at
  formation, or merely the result of nobody holding invite rights. theory.md assumes the former;
  tracked in §G.

## Source review (2026-09-01)

Reviewed `ser/sereus` at `Optimystic & Quereus upgrade` (2026-08-31): `docs/`, `schemas/*.qsql`,
`packages/cadre-core`, `tickets/`. Evidence order: schema and implementation over prose docs.
`packages/strand-proto` is deprecated and stale — ignore it.

### Confirmed as roadmap, not blockers

Two of the findings below were checked with the maintainer and are **coming**, though absent from
the current source. We are designing chat around the platform as intended, not as it stands today,
so the stories that depend on them **stand as written**:

- **Zero managers as a deliberate, verifiable state.** The settled strand survives, and with it
  theory.md's central claim, [02](../../stories/mobile/02-start-a-strand.md) Alt A, [05](../../stories/mobile/05-add-someone-to-a-strand.md)
  Alt D, and the three-state indicator in §E.
- **Private nicknames**, and eventually cross-sApp grouping by screen name (§C.10).

The finding below is recorded as it was found, against today's source.

### The constraint in today's source

**A closed strand can never deliberately reach zero managers.** `schemas/strand.qsql:393-395`
(`Manager.MinOneManager`) rejects any delete leaving no managers — including the sole manager's own
resignation. The last manager cannot resign; managership is a permanent obligation for at least one
person. Zero managers is reachable **only by accident** (see below), and is indistinguishable from
one.

**Resolved as roadmap** (above): the capability is coming, so the settled strand stays in our
design. Worth re-checking when it lands, since the shape of the guarantee — in particular whether an
invitee can *verify* zero managers before joining — is what our stories lean on.

Two further findings compound it:

- **Removal does not actually cut anyone off.** A closed strand's read gate is a single shared
  `MemberPrivateKey` handed to every joiner (`schemas/control.qsql:130-131`). A removed member keeps
  it and keeps everything already replicated; `docs/strands.md:285-288` concedes that rotating the
  gate "currently means re-forming the strand" — new id, new network, no history. So "put the
  stranger out" ([05](../../stories/mobile/05-add-someone-to-a-strand.md) Alt F) has no implementation behind it.
- **A removed member holding an unspent invitation re-admits itself.** Invitations are bearer
  tokens, removal does not cancel them, and no gate checks that the issuer is still a manager
  (`docs/strands.md:302-304`, `schemas/strand.qsql:80-103`).

### The layer our stories assume is not switched on

The whole `Member`/`Manager`/`Invite` model is implemented and tested but **unused by any production
path**. Every joiner of a closed strand is handed the *founding* member key, so all parties present
the same identity (`tickets/backlog/feat-strand-party-identity.md`;
`packages/reference-app-rn/src/chat-strand.ts:179-198`). Today there is no per-party identity, no
real distinction between a manager and a member, and no sender attribution. `docs/strands.md` reads
as though this were all operative and will mislead anyone who reads it alone.

### What was confirmed as we assumed

- Any manager can remove any other manager; **no generation gate, nothing privileges the founder**
  (`strand.qsql:340-345, 450-460`).
- A manager can promote an existing member (`addManager`), and can demote without removing.
- A sole manager is unremovable; promoting a second makes the first removable immediately.
- Open strands have **no managers and no members at all** — by schema, `Member`/`Manager`/`Invite`
  are all `OnlyClosed`. No invitations, no removal, no leaving, no rejoining; the concepts do not
  exist. (Stronger than we assumed, and consistent with our story.)
- Invitations are single-use bearer tokens, optionally expiring, cancellable.
- No delivery or read status anywhere — our decision to drop the column matches the platform.
- No per-member history scoping; every member holds everything.
- Strand titles are the app's to own; sereus has no metadata slot for them.

### What we assumed that is not so

- **An invitation cannot carry manager status.** There is no "join as manager" invite. Manager
  status is conferred only by a live manager signing a promotion, though `admitManager` does
  admit-and-promote in one transaction. Story [02](../../stories/mobile/02-start-a-strand.md) step 3 and
  [05](../../stories/mobile/05-add-someone-to-a-strand.md) need rewording — the *effect* is reachable, the mechanism is
  not what we wrote.
- ~~Private nicknames are not in sereus~~ — **confirmed as roadmap**; not in the current source.
  §C.10 stands.
- **There is no home for private per-user state.** Read position ([10](../../stories/mobile/10-catching-up.md)) would be
  public in an sApp table, and the control DB — which has exactly the right replication, party-wide
  and private — has a **fixed, closed schema with no app-extension table**. Story 10's "the same
  wherever I'm looking from" has nowhere to live.

### Hazards a chat app inherits

| Issue | Evidence | Bearing on us |
|-------|----------|---------------|
| Zero-manager permanent freeze via partition — `MinOneManager` counts *locally visible* rows, so two partitioned nodes each removing a different manager converge to zero, unrecoverably | `strand.qsql:389-392`, `strands.md:291-297` | The accidental version of the state we *want* deliberately |
| Concurrent same-PK insert silently last-writer-wins, **both writers told they succeeded** | `tickets/blocked/optimystic-concurrent-same-pk-insert-silent-lww.md`, repro verified | Message loss. `chat-simple.qsql` uses client UUIDs to dodge it |
| A block written while only one machine holds it can be unreadable by others | `tickets/blocked/block-held-by-only-one-machine-is-unreadable.md`, verified, still ~1-in-5 as of 2026-08-24 | Two phones, no always-on node = messages can vanish |
| No store-and-forward; sync is pull-on-read | `architecture.md:713` | If both parties are asleep phones, nothing moves. [04](../../stories/mobile/04-our-first-conversation.md) Alt B assumes it eventually arrives |
| Sending while unreachable **is** meant to be a local write, not an outbox — the phone holds the strand. Optimystic short-circuits consensus for a solo node and `strand-backfill.ts` catches up blocks written alone. But `CadreNode` hardcodes a cluster size that makes the solo path unreachable | `optimystic/docs/optimystic.md:40-50`, `cadre-consistency.md:26-28`, [sereus#2](https://github.com/gotchoices/sereus/issues/2) | Stories [04](../../stories/mobile/04-our-first-conversation.md) and [11](../../stories/mobile/11-writing-a-message.md) are written for the intended behaviour: no pending state, no outbox. If #2 and the single-holder-block defect do not clear, the failure path becomes the common one |
| No message ordering, no HLC or causal delivery for sApp data; timestamps self-asserted | `chat-simple.qsql`, `cadre-consistency.md` (unimplemented) | Ordering is ours to solve and cannot be solved well |
| Every strand is a separate libp2p node; `realtime` latency hint means never hibernating | `architecture.md:735-750, 724-733` | 50 strands = 50 nodes. Responsiveness and battery are in direct tension |
| **Partial locality** — a device holds only what it can and leans on the cohort for the rest; strand blocks replicate to a subset by design | `cadre-consistency.md:22` | **Not a correctness problem** — Quereus queries find everything; partial locality costs latency and availability. Reads may block while blocks are fetched, or fail when nothing holding them is reachable, and must never render as an empty result. A strand carried only by phones may not hold its whole history between them. Recorded in `specs/domain/overview.md`; affects [10](../../stories/mobile/10-catching-up.md), [21](../../stories/mobile/21-receiving-media.md), [32](../../stories/mobile/32-finding-something.md), [42](../../stories/mobile/42-staying-connected.md) |
| No cross-strand search, and most strands hibernate | `architecture.md:690, 735-750` | [32](../../stories/mobile/32-finding-something.md) must wake every strand, not merely iterate |
| Deleting the control `Strand` row destroys the party's only copy of `MemberPrivateKey` | `architecture.md:1433`, `debt-strand-tombstone-reap.md` | [33](../../stories/mobile/33-managing-a-strand.md)'s "forget entirely" needs the same guard `cadre strand remove --yes` has |
| Cross-party strand discovery is unsolved; cohorts today are one party's machines | `strands.md:115-129` | Replication breadth buys machine redundancy, not party redundancy |
| Strand contracts are design-stage, nothing implemented, no ticket | `docs/strand-contracts.md:3` | theory.md's "agreements can carry consequences" has nothing behind it yet |
| No attachment/blob strategy — no chunking, resumability or dedup | no ticket found | [20](../../stories/mobile/20-sending-media.md)/[21](../../stories/mobile/21-receiving-media.md) assume media works |
| `docs/api.md` §§1–2 stale; `push-network.md`, `cadre-consistency.md`, `strand-contracts.md` all design-stage | each says so at the top | Do not treat these as descriptions of what exists |

## Open questions for sereus

Narrowed twice: first by the source review, then by confirming that leaderless strands and private
nicknames are both coming. What remains are things nothing in the source or the roadmap yet covers.

**Filed upstream 2026-09-01** — `gotchoices/sereus` issues
[#3](https://github.com/gotchoices/sereus/issues/3) (MinOneManager local-count floor now that
deliberate rotation to zero is coming, and telling a deliberate seal from an accidental one),
[#4](https://github.com/gotchoices/sereus/issues/4) (what removal actually prevents),
[#5](https://github.com/gotchoices/sereus/issues/5) (is per-collection revision order available to
sApps),
[#6](https://github.com/gotchoices/sereus/issues/6) (no home for party-private per-user state),
[#7](https://github.com/gotchoices/sereus/issues/7) (`schemas/chat.qsql` superseded and broken).
Questions 1–4 below correspond to #4, #6, #5 and the unfiled attachments question.

**Blocking a story we have drafted**

1. **Does removal revoke read access, in the intended design?** Today it cannot — the read gate is a
   single shared member key the removed party keeps, and rotating it means re-forming the strand.
   [05](../../stories/mobile/05-add-someone-to-a-strand.md) Alt F says "nothing further reaches them", which is the
   evident intent of having ejection at all. Does per-member keying arrive with the leaderless work,
   or separately? Related: a removed member holding an unspent bearer invitation currently re-admits
   itself, since removal cancels nothing.
2. **Where does private per-user state live?** Read position ([10](../../stories/mobile/10-catching-up.md)) needs to
   replicate across a party's own devices and be invisible to other members. The control DB has
   exactly those properties and a closed schema; an sApp table has the wrong audience. Nothing else
   fits.
3. **Is message ordering ours to solve?** ([#5](https://github.com/gotchoices/sereus/issues/5).)
   Reframed by a find: Optimystic already totally orders transactions within a collection by commit
   revision, and treats wall-clock timestamps as metadata (`optimystic/docs/correctness.md` §6.3).
   The question is whether that order is reachable from an sApp through Quereus. A placeholder spec
   with both routes is recorded in `specs/domain/schema.md`; **stories stay out of it**.
4. **Is there a plan for attachments?** No chunking, resumability or dedup; media would be rows
   replicated as ordinary blocks. [20](../../stories/mobile/20-sending-media.md) and [21](../../stories/mobile/21-receiving-media.md) assume
   media works.

**Shapes a decision, not blocking**

5. **When does per-party identity land** (`feat-strand-party-identity`)? Until it does there is no
   sender attribution at all, so no group story is testable end to end. Presumably the same wave as
   the leaderless work — worth confirming they ship together.
6. **Are strand contracts on the roadmap?** Design-stage, no ticket. theory.md says agreements can
   carry consequences; nothing backs that yet.
7. **Can a removed member be told they were removed?** Still uncontemplated, and entangled with
   question 1.
8. **Is cross-party strand discovery coming?** Cohorts today are one party's machines, so
   replication breadth buys machine redundancy and no party redundancy — which is what
   [04](../../stories/mobile/04-our-first-conversation.md) Alt B and [42](../../stories/mobile/42-staying-connected.md) quietly rely on.

**Known and accepted for now**

Reliability hazards from the review — silent last-writer-wins on concurrent same-PK inserts,
single-holder blocks that can be unreadable, no store-and-forward — are platform defects with
verified repros rather than design questions. They do not change any story. They do mean the app
cannot be trusted end to end until they clear, and they strengthen the case
[42](../../stories/mobile/42-staying-connected.md) makes for a party having something always on.

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
