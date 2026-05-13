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
| Id | integer | Strand-unique, monotonic |
| MemberId | text | FK → Member.Id |
| Content | text | Message text |
| Timestamp | datetime | When sent (UTC) |
| Status | text | sent / delivered / read (advisory; computed where possible) |

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
