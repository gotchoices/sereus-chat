# Schema

The chat app owns two pieces of data: device-local profile, and the per-strand chat sApp schema replicated to strand members. Everything else — strand registry, cadre peers, authority keys, invitations — is owned and persisted by sereus and is **not** declared here. See `sereus.md` for the integration boundary and `interfaces.md` for the call mapping.

## Local (device only)

### profile

| Column | Type | Notes |
|--------|------|-------|
| id | text | Single row, this device |
| name | text | Required |
| email | text | Optional |
| phone | text | Optional |
| notes | text | Optional |
| avatar_uri | text | Local file or blob ref |

Profile is purely device-local (AsyncStorage / MMKV). Sereus's view of identity is the libp2p Peer ID; the chat app surfaces a friendlier name on top.

## Per-strand chat sApp schema

Every chat strand carries this schema. Each participant inserts itself into `Member` on first attach — there is no central member list, read everything from the strand database.

### Member

| Column | Type | Notes |
|--------|------|-------|
| Id | text | Peer ID of the participating member |
| Name | text | Display name |
| AvatarUri | text | Optional, shared blob ref |

### Message

| Column | Type | Notes |
|--------|------|-------|
| Id | text | Client-generated UUID. Not a sequence — see *Ordering* below |
| MemberId | text | FK → Member.Id |
| Content | text | Message text |
| Timestamp | datetime | Asserted by the sender. Not authoritative — see *Ordering* below |

No delivery or read status is tracked. A reply is the evidence a message was read; the app claims
nothing further, and reports nothing back to a sender. (Decision recorded in
`design/stories/mobile/STATUS.md` §G.)

### Ordering — placeholder, unresolved

**There is no authority on message timing.** Each party logs its own content to the strand; nothing
is watching, and no clock is trusted. `Timestamp` is the sender's assertion about their own clock and
nothing more. A strict sequence is not available either — the retired upstream `schemas/chat.qsql`
attempted one and it cannot hold under concurrent writers, which is why `chat-simple.qsql` moved to
client-generated UUIDs.

This is recorded so that no part of the app quietly assumes an authoritative order exists. Stories
deliberately do not go into it.

Two routes are open, and the choice is deferred until sereus answers
[gotchoices/sereus#5](https://github.com/gotchoices/sereus/issues/5):

1. **Lean on the stack.** Optimystic states that within a collection, transactions are totally
   ordered by a monotonic commit revision, and that wall-clock timestamps are metadata that do not
   affect correctness (`optimystic/docs/correctness.md` §6.3). If that order is reachable from an
   sApp through Quereus, it is a consensus order and we should use it in preference to any timestamp.
2. **Build it here.** A hash-linked causal history in this schema: each message records the hashes of
   the messages its author had already seen. That does not establish absolute time, but it
   establishes what an author had seen when they posted, makes back-dated insertion detectable, and
   lets honest participants bound a dishonest clock from both sides. Established prior art — Matrix's
   `prev_events` DAG, Secure Scuttlebutt's per-feed hash chains, Merkle-CRDTs.

Either way the app must not present a message order as authoritative when it is not. If a trail of
causal references does end up existing, that is a benefit — but nothing here is designed in order to
manufacture one.

### Attachment

| Column | Type | Notes |
|--------|------|-------|
| Id | integer | Attachment id |
| MessageId | integer | FK → Message.Id |
| Type | text | image, video, file, location |
| Uri | text | Content reference (blob, CID, …) |
| MimeType | text | Optional |
| Name | text | Display name |

## What sereus owns (not in this file)

These concepts live in sereus's Control DB or its formation protocol — referenced from screens via the adapter, never modeled here:

- Strand registry (which strands the user participates in)
- Cadre peers (the user's own devices)
- Authority and validation keys
- Open invitations, registrations, formation usage
- Strand type (`'o'` open vs `'c'` closed)

## Notes

- Sender identity **is** the Peer ID — never persist a parallel "sender_id".
- Open vs closed strands changes the membership model; see `sereus.md` for the project-level decision.
- Mock mode mirrors these tables as JSON fixtures with the same shapes.
