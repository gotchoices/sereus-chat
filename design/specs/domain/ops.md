# Domain Operations

Operations the UI relies on. Implementation details (SQL, Quereus bindings) deferred to wiring phase.

## Strands.list()

Returns strand summaries for the home list.

**Returns** (array):
- `id`: strand identifier
- `displayName`: partner's name
- `avatarUrl`: partner's avatar (optional)
- `lastMessage`: `{ previewText, timestamp }`
- `unreadCount`: integer

**Notes**: Sorting/filtering handled client-side. Unread badge caps at 99+.

## Strands.listMessages(strandId)

Returns messages for a strand conversation.

**Returns** (array):
- `id`: message identifier
- `senderId`: who sent it
- `text`: message content
- `timestamp`: when sent
- `attachments`: array of attachment refs
- `status`: sent | delivered | read

## Strands.search(query)

Global search across connections and message content.

**Returns** (array):
- `strandId`: which strand matched
- `partnerName`: connection name
- `matchedText`: preview with match context
- `timestamp`: when the match occurred

## Profile.get() / Profile.save(data)

Local profile data (device/cadre scope).

**Fields**: `name` (required), `email`, `phone`, `notes`, `avatarUri`

## Invitations.create() / Invitations.accept(token)

Generate invitation token; accept incoming invitation to establish strand.

