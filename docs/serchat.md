# serchat as the Sereus testbed

serchat (`apps/cli`) is the cheapest place to exercise a Sereus feature: a command is a
few lines, a GUI change is a screen. This document records how Sereus v1.14 actually
works where serchat needs it (researched in the source, 2026-10-13; citations are to
`sereus/` unless marked `chat/`), what serchat's state is and where it belongs, and the
plan for making serchat able to run every Sereus mode.

Command reference: `design/specs/cli/commands.md`. Progress: `STATUS.md`, Phase 7a and
later.

## How Sereus organises parties, nodes and keys

### Words

We use Sereus's terms, and chat follows them (see *What this means for Sereus Chat*).

- **Party** — a person or entity. Identified by its `partyId`.
- **Member** — a party that is allowed on a given strand. A member is never a node: one
  member can be present through several nodes.
- **Node** — one running Sereus process (a phone app, a server, a serchat). Identified by
  its libp2p **peer id**, which comes from its identity key.
- **Cadre** — the nodes of one party. They share a replicated **control database**
  (`CadreControl.*`): which nodes belong, which keys are owners, which strands the party has.
- **Strand member identity** — each party has one membership identity per
  strand (`CadreControl.StrandPartyKey`, replicated to every node of the party). Each node
  that runs the strand registers itself under that member as a device row
  (`Strand.MemberPeer`), using a per-strand transport peer id. Many devices, one member
  (`docs/strands.md:7-14, 335-347`; `docs/architecture.md:1149, 1179`).

### Owner keys

- An **owner key** can authorize changes to the cadre. The `OwnerKey` table holds any
  number of them; all owners are equal. The **founding** row is only the first one, seated
  unsigned when the table is empty (owner genesis, `ensureOwnerKey`); it confers no extra
  rights. Any owner can remove any other owner except itself and the last one.
- **In v1.14 an owner key is the node's own identity key.** A node holds either no owner
  key or exactly one: its own (`getIdentityOwnerKey`, `cadre-node.ts:3018-3026`;
  `docs/architecture.md:1836-1841`). There is no slot for a separate owner key; separating
  them (for hardware keys, for owner keys only on user devices) is a backlog ticket
  (`tickets/backlog/feat-owner-keys-only-on-user-devices.md`). So "generate an owner key"
  today means "make this node an owner".
- **A node becomes an owner** by owner genesis (first node of a new party), by an existing
  owner calling `addOwner(publicKey)`, or by redeeming a cadre invitation that grants
  ownership.
- **Trust comes from a local anchor, not the table.** Each node keeps a `TrustedOwnerStore`
  of owner keys it learned out of band — its own genesis, an operator pin, an invitation,
  a claim — and follows the replicated table only along chains of signatures from those
  (`trusted-owner-store.ts`, `owner-anchor-sync.ts`). Anyone could write a founding row into
  their own copy of a table; the anchor is what stops that from mattering.

### Keys decide who a device is

- A device holding a node's **identity key** is that node: same peer id, same addresses
  in the cadre's records. The recovery test below starts a node from a key kept offline.
- A device running any node of a party can act as that party's **member** in its strands:
  the member key for each strand is replicated to every node of the party.
- **Owner keys:** any number per cadre; zero or one per node (its own identity, in v1.14).
  Every node has an identity key: its peer id is that key's public half, encoded (an
  Ed25519 peer id embeds the public key). A node "has an owner key" exactly when its
  identity's public key is in the `OwnerKey` table; a keyless node has an identity like
  any other, just not one the cadre lists as an owner. So a node cannot hold a second,
  reserve owner key: a reserve key is a second identity, used by running it as its own
  node (the recovery test). The limits this brings — one owner key per node, the owner key
  always hot on the device, no hardware key, rotating an owner key changes the peer id —
  are what `feat-owner-keys-only-on-user-devices` proposes to remove by separating the two.

### Recovery with an offline backup owner key: works in v1.14

Proven by `test/stack/owner-recovery.mjs` (`yarn workspace @sereus-chat/stack-check
owner-recovery`), real nodes, about 33 s, passed three runs of three:

1. The phone A founds the cadre; an always-on, keyless node D is admitted by A.
2. A generates a backup key K, makes it an owner (`addOwner(K)`), and vouches for K's
   node identity (`authorizePeer(peerId(K))`) — K never runs. D derives K from A's
   signature. The vault holds: K, the party id, the cadre's owner keys (public), and an
   address of an always-on member.
3. A is lost.
4. A recovery node R starts with identity K, trusting the owner keys from the vault, and
   reaches the cadre through D. It runs **no** owner genesis (the table is not empty) and
   takes up K as its signing key (`initializeSeedBootstrap`).
5. R removes A as a node and as an owner, and admits a new phone P with an
   owner-granting cadre invitation, which P redeems at D.
6. R stops: the key goes back in the vault. P, now an owner, admits another node, and D
   accepts it.

Known limit (1.15 release notes): **removal stops a machine's control access, not its
strand access.** A removed — say, stolen — phone keeps the cadre's strand keys and can read
and write shared strands until each strand is re-formed; Sereus has not decided what
removal should do there. Recovery therefore regains control of the cadre, not exclusive
access to its strands.

What a backup needs beyond the key, learned on the way:
- **The backup's node must be vouched too.** An owner key alone does not get a node onto
  the control network; the cadre admits member nodes. Because owner key = identity key in
  v1.14, vouching the key's peer id makes the vault key a (normally offline) node of the
  cadre.
- **The recovery node must not run owner genesis** before it has synced, or it founds a
  rival owner row in its own empty copy.
- **It needs the owner keys to trust** (public; from the vault kit) and **an address to
  reach** an always-on member. A cadre with no surviving always-on node has nothing to
  recover into (as Sereus's own recovery ticket notes).

Sereus's recovery ticket (`tickets/blocked/decide-owner-recovery.md`) does not list this
option; it lists a second owner device, a printed owner invitation, social recovery and a
time lock. Worth adding, with this test. Separating owner keys from node identities
(`tickets/backlog/feat-owner-keys-only-on-user-devices.md`) would make a backup a pure key
rather than an offline node.

### Adding a node to a cadre: four ways

| Way | Who knows what first | What moves | Owner side | Node side |
|---|---|---|---|---|
| **Seed** | The owner knows the node's peer id (and maybe addresses) | A signed seed: party id, the cadre's peers and their addresses | `addDrone` / `authorizePeer` + `createSeed` (`cadre enroll add <peerId>`) | Start with the seed and the owner key pinned (`--seed`, `--pin-owner-key`) |
| **Targeted invitation** | The owner knows the peer id | An invitation bundle: party, owner keys to trust, member addresses, a one-use key | `createCadreInvitation({ peerId, grantsOwner? })` | `redeemCadreInvitation(bundle)` (`cadre start --invitation`) |
| **Open invitation** | Nobody knows the peer id | The same bundle, for whoever redeems it first (15 min if it grants ownership, else 24 h) | `createCadreInvitation({ grantsOwner? })` | `redeemCadreInvitation(bundle)` |
| **Claim** | The node does not know its owner or party | The node shows a code (`sereus-join:`) with its peer id, addresses and a one-time secret; the owner sends a seed proved with the secret | `claimNode(payload)` | Start waiting to be claimed (`claim: { secret, record }`); after the claim, restart into the owner's party |

Only an invitation can make the new node an owner (`grantsOwner`); seeded and claimed nodes
are keyless. A claimed node cannot become an owner while it runs in claim mode.

Correction to our earlier understanding: claiming does not exist because the owner lacks
the peer id — the code carries it. It exists because the node lacks an owner: it can be
started (by cadre-host, say) before anyone has decided whose it is.

### What a keyless node can and cannot do

**Can:** sync and replicate the control database once vouched for; keep its own address
record current; run and host every strand the party has (its own and joined ones,
offered as `strand:discovered`), including registering its `MemberPeer` under the party's
member key, which every node holds; answer strand formation (seat a joiner from an
invitation the party made); write sApp data; receive seeds; relay.

**Cannot:** authorize, remove or claim nodes; make seeds or cadre invitations; add or remove
owners; publish or unpublish strands or party-wide joins; `requestJoin`; write revocation
tombstones (`requireOwnerSigningKey`, `cadre-node.ts:6032`; `docs/strands.md:427, 473`).

So a keyless node is a full participant in the party's strands and a non-participant in
running the cadre. cadre-host's nodes are designed that way: "The host holds no owner key
and never founds a cadre" (`docs/cadre-host.md:44`).

### Who may write in a strand

Strand RBAC covers only the `Strand.*` tables (membership). **sApp tables have no built-in
writer identity**: a write carries none unless the sApp's schema demands a signature and
checks it. Sereus's own `chat.qsql` shows how (`ParticipantKey`, `MessageAuthorized`), but
nothing loads it; the reference apps and Sereus Chat run permissionless schemas
(`docs/schema-guide.md:705-735`; `docs/strand-contracts.md:387-390`).

## What this means for Sereus Chat

1. **Chat's "member" is a device, Sereus's is a party: chat's domain contract must change.** The chat core writes `App.Member` rows keyed
   by the node's control peer id, and `messages.memberId` and `isMe` follow it
   (`chat/packages/core/src/sereus/strands.ts:53-55, 95-108`; `model.ts:266-291, 461-467`;
   `chat/design/specs/domain/schema.md:18, 28`). Two nodes of one party in one strand
   therefore appear as two people, while Sereus considers them one member. The fix: key
   `App.Member` by the party's strand member key (`Strand.Member.Key`), so every node of a
   party writes and reads as the same member; keep the display name in that Member row
   (one per member per strand, the same on all of the member's nodes), with a local copy
   each way — the node's own name before a strand is reachable, the row's name after.
2. **Leaving a joined strand probably does not leave it** (read from the source, not run).
   `strands.leave` unpublishes a `Strand` row, which a joined strand does not have; the
   party-wide `JoinedStrand` row survives, so the strand is re-offered on restart and stays
   on sibling nodes. The right call is `forgetJoinedStrand` (`docs/strands.md:431`).
3. **Chat keeps its own list of joined strands** (`joinedStrands` slot), which Sereus says
   apps need not: party-wide joins are offered to every node. Kept for migration; a
   candidate for removal.
4. **`isManager` is not real** in the Sereus model (faked like `isMe`).
5. **App writes are unauthenticated.** Any member can write any `MemberId`. Acceptable for
   now; worth knowing when testing.

Item 1 is a domain-contract change (decided 2026-10-13); items 2–4 are core fixes; item 5 is a known limit.

## What a serchat profile is

A profile is **one node**: one identity key, so one peer id. libp2p allows one running node
per identity, and a node's block storage has one writer, so one process runs a profile at a
time (the lock). Everything else serchat keeps has a different natural home. By scope:

| Scope | What | Where now | Where it belongs |
|---|---|---|---|
| **Node** (one peer id) | Identity key; block storage; trusted-owner anchor, dial targets, strand network state; claim record | Profile folder | Profile folder, single writer. This is what makes a profile a profile |
| **Party** (the cadre) | Nodes, owners, strands, joined strands, strand member keys | Control database | Already replicated by Sereus; serchat only reads and writes it through commands |
| **Member** (the party, as seen in a strand) | Display name | `profile` slot, per node | The strand's Member row, keyed by the party's member key, so all of the member's nodes show one name; cached locally both ways |
| **Chat, per node** | Drafts, read cursors, mute and archive, list cache, invitations made | Slots in the profile folder | The profile folder |
| **Node start options** | Party id, relays, listen port | `profile.json` | The profile folder (they describe this node) |
| **serchat itself** | Defaults (output format, `--wait`, default profile), command aliases | — | A shared `~/.serchat/config.json` read by every instance; written rarely, atomically. A database is not needed for that load; revisit if it grows |
| **Session** | Rows of the last listing; `--json` | `last.json` per profile; flags | Rows per profile is right (a script and a shell on one node share them); flags stay per run |

**Several serchats at once** then means one of two things, both wanted:

- **Several nodes:** several profiles, each its own process. They can be separate parties
  (testing chat between people) or one party's cadre (testing multi-device and cadre
  management): an owner and a keyless sibling, say.
- **Several terminals on one node:** the first process runs the node; later ones attach to
  it instead of failing on the lock. This is the background mode below, and the lock file
  already tells a new process who to attach to.

The name "profile" can stay (it is what users type), defined as above; `--node` would be a
more exact alias.

## Plan

serchat first, fully general: every Sereus mode reachable from a command, so Sereus can be
exercised (and its gaps shown) without touching a GUI. What proves out moves to the phone
afterwards. Each step's commands go in `design/specs/cli/commands.md` as they land.

0. **Upgrade to sereus 1.15.0** first. Step 1 builds on APIs that 1.15 adds or replaces
   (`removeMachine`, `listMachines`, invitation `reach`, join requests).
1. **Core: cadre administration in the model.** Extend `ChatModel.cadre` (the phone's
   cadre manager gains them later; the mock mirrors them):
   - status with owner keys, the anchor, and members both ways (`listMembers`,
     `listAuthorizedMembers`);
   - `authorizeNode(peerId, addrs?)` → a seed; `createInvitation({ peerId?, owner?, ttl?,
     uses? })` → a bundle; `withdrawInvitation`;
   - `addOwner(key)`, `removeOwner(key)`, `removeMachine` (exists), `claimNode` (exists),
     `exportOwnerKey` (exists);
   - **backup key:** create one (generate, `addOwner`, `authorizePeer`, return the kit);
   - the party's strands at the control level: list, and remove or forget a joined strand.
2. **serchat: how a profile starts.** `serchat -p <name> init <how>`, recorded in
   `profile.json`:
   - `found` — a new party, this node its founding owner (today's behaviour);
   - `seed <seed> --owner-key <key>` — join a cadre by seed, keyless;
   - `invitation <bundle>` — join by cadre invitation (an owner if it grants ownership);
   - `claimable` — wait to be claimed: print the `sereus-join:` code, restart into the
     claimer's party once claimed;
   - `identity <keyfile> --party <id> --owner-key … --reach <addr>` — run as an existing
     node identity: the backup-key recovery node, or a node moved to another machine.
3. **serchat: `cadre` commands** over step 1: `cadre status | members | owners | authorize
   <peerId> | invite [--peer <id>] [--owner] | claim <code|file> | remove <peerId> | owner
   add|remove <key> | backup create -o <file> | export-owner-key | strands`. Then every
   way of adding a node, and recovery, runs between serchats, and between serchat and the
   phone.
4. **Chat member identity = the party** (domain contract): `App.Member` keyed by the
   party's strand member key; display name in the Member row, cached both ways. Two
   serchat nodes of one party then appear as one member.
5. **Core fixes found here:** leaving joined strands (`forgetJoinedStrand`); drop the chat
   `joinedStrands` list if Sereus's party-wide joins cover it; real `isManager`.
6. **Background mode:** a running serchat serves its node on a local socket (named pipe on
   Windows); later invocations of that profile attach to it instead of failing on the lock.
   Done properly, no stopgap.
7. **Shared serchat config** (`~/.serchat/config.json`) when there is a second setting
   worth sharing.
8. **The phone** takes up what proved out: cadre administration, backup and recovery, the
   member-identity change.

## Upstream

To raise with Sereus (prepared, not posted):
- **Recovery:** add "offline backup owner key" to `decide-owner-recovery.md`, with
  `owner-recovery.mjs` as evidence and the three caveats above.
- **Owner key separate from node identity** (`feat-owner-keys-only-on-user-devices`):
  would let a backup be a key alone, not an offline node; worth a vote from us.
- Stale comment: `strand-transport-key.ts:46` says production never writes a
  `MemberPeer` row; the membership reconciler does.

## Decisions (2026-10-13)

- serchat is built out first and fully general; the phone follows.
- Chat's member becomes Sereus's member (the party); the display name lives in the
  strand's Member row, cached locally both ways.
- serchat is to be published; the core and resources stay in this repo, unpublished, and
  are bundled into serchat. "Private" in `package.json` means "not published to npm",
  not secret. Publishing the core as a public library for other apps may come later;
  keeping `core/protocol` separable (`app-family.md`) keeps that door open.
