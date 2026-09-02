# Domain Operations

What the UI relies on. Implementation (SQL, Quereus bindings, mock fixtures) is the adapter's
business; screens call these and nothing else.

## Strands

### `Strands.list()` → `StrandSummary[]`

Every strand the user belongs to.

```
StrandSummary {
  id, title, avatarUri|null, isGroup, memberCount,
  lastMessage: { previewText, senderName|null, timestamp } | null,
  unreadCount, mentioned, muted: 'none'|'soft'|'hard',
  draftPreview: string|null, archived, pending
}
```

- `title` is **the app's**, not sereus's — no strand-title slot exists upstream. Two-party strands
  fall back to the other member's name; unnamed groups compose from member names.
- `senderName` is null when `memberCount <= 2`, so rows omit the prefix.
- `mentioned`, `draftPreview`, `muted`, `archived` are device-local; they never touch strand data.
- Sorting and sectioning are the screen's. Muted strands are not promoted by new traffic.

### `Strands.getState(strandId)` → `StrandState`

```
StrandState { visibility: 'public'|'private', managerCount, settled, canIManage }
```

`settled ≡ visibility === 'private' && managerCount === 0`. Derived from **recorded** state only —
never from activity, last-seen or silence.

### `Strands.listMembers(strandId)` → `Member[]`

```
Member { id, name, avatarUri|null, isManager, isMe }
```

`name` is the local nickname where one exists, else the shared display name.

### `Strands.listMessages(strandId, { before?, limit })` → `Message[]`

```
Message { id, memberId, content, timestamp, replyToId|null, editedAt|null,
          attachments: Attachment[], reactions: [{ memberId, symbol }] }
```

No delivery or read status exists. Order is the adapter's responsibility — see `schema.md` →
Ordering; screens must not sort on `timestamp` themselves.

### `Strands.listAttachments(strandId, { kind? })` → `Attachment[]`

```
Attachment { id, messageId, type, uri|null, mimeType, name,
             byteSize|null, durationMs|null, locality: 'local'|'fetching'|'unreachable' }
```

`locality` is required. A null `uri` never means absent — see `overview.md` → Partial locality.

### Writes

| Operation | Notes |
|-----------|-------|
| `Strands.send(strandId, { content, attachments, replyToId? })` | A local write. No pending state; only a genuine failure surfaces |
| `Strands.editMessage(id, content)` | In place; no version chain |
| `Strands.deleteMessage(id)` | Removes the row; the app renders no tombstone of its own |
| `Strands.react(messageId, symbol)` / `unreact` | Attributed; open symbol set |
| `Strands.leave(strandId, { keepIdentity })` | `false` is permanent and returns as a new member |
| `Strands.resignManager(strandId)` | Permanent |
| `Strands.removeMember(strandId, memberId)` | Stops what follows; undoes nothing |

There is **no** `Strands.delete`. A strand cannot be deleted, only left.

## Search

### `Strands.search(query, opts)` → `AsyncIterable<SearchBatch>`

```
opts { strandId?, kinds?, from?, to?, senderId? }
SearchBatch { results: SearchHit[], strandsSearched, strandsTotal, strandsSkipped }
SearchHit { strandId, strandTitle, messageId, senderName, snippet, matchRange, timestamp }
```

**A stream, not a promise**, and deliberately so: there is no cross-strand index and most strands are
not running until something wakes them, so a promise would block on the slowest strand and make
partial results impossible. Cancellation must stop the sweep — an abandoned search must not go on
waking strands.

## Invitations

| Operation | Returns |
|-----------|---------|
| `Invitations.create({ strandId?, visibility?, grantsInviteRight })` | `Invitation { id, token, url, qrPayload, strandId, expiresAt, grantsInviteRight, spent }` |
| `Invitations.listOutstanding()` | `Invitation[]` |
| `Invitations.cancel(id)` | — |
| `Invitations.inspect(token)` | `InvitationPreview { inviterName, inviterAvatarUri, strandState, grantsInviteRight, status }` |
| `Invitations.accept(token)` | `strandId` |

`inspect` is what lets somebody judge a strand **before** disclosing themselves. It returns only what
the platform can actually establish; it never guesses.

## Profile, preferences, storage

| Operation | Scope |
|-----------|-------|
| `Profile.get()` / `Profile.save(data)` | Device-local. Only `name` and `avatarUri` are shared |
| `Prefs.get()` / `Prefs.set(patch)` | Device-local; settings do not replicate |
| `Storage.usage()` → `{ totalBytes, byStrand[] }` | This device |
| `Storage.trim(strandId, criteria)` | Local copies only; other members are unaffected |

## Errors

Every operation may surface the classes in `interfaces.md`. Two matter to nearly every screen:
a read **blocking while blocks are fetched**, and a read that **cannot complete** because nothing
holding them is reachable. Neither may ever render as an empty result.
