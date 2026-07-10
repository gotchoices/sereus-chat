---
provides: ["screen:mobile:ChatInterface"]
needs: ["domain:Op:Strands.listMessages", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/screens/chat-interface.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/stories/mobile/responding.md
  - design/stories/mobile/sending-media.md
  - design/stories/mobile/searching-messages.md
  - design/stories/mobile/editing-messages.md
  - design/stories/mobile/video-call.md
---

# Consolidation: ChatInterface

## Purpose

Strand conversation view with message history and composer. Access to voice/video call and in-strand search.

## Route

- `ChatInterface`
- Deep link: `chat://chat/{strandId}` (see navigation.md linking config)

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Messages present | happy |
| empty | No messages yet | empty |
| error | Load failure | error |
| composing | Text input focused | — |
| editing | Long-press own message → Edit | — |

## Data Requirements

- `Strands.listMessages(strandId)` → `Message[]`
- Message: `{ id, strandId, senderId, text, timestamp, attachments[], status }`
- Partner info from strand metadata
- Unread count cleared on entering strand

## Component Inventory

Built from the shared component layer (`src/components/`); all color/spacing via
theme tokens.  The header (back, `Avatar`, name, call/video/search `IconButton`s)
is supplied by the navigator, not this screen.

- MessageList: FlatList of `MessageBubble` (outgoing=accent, incoming=surfaceAlt; status tick; optional attachment slot)
- Composer bar: `IconButton` attach + themed multiline TextInput (surfaceAlt) + accent send `IconButton`
- AttachmentStrip: horizontal chips with remove overlay
- EditControls: Cancel + Save `IconButton`s replace send during edit
- `EmptyState` for a conversation with no messages

## Implementation Notes

- Message bubbles: align by `senderId === me.id`; group contiguous same-sender messages
- Timestamps: relative if <24h, otherwise date
- Text and attachments render as separate bubbles (no mixed bubble)
- Overflow menu per message: three-dot button → Reply, Copy, Edit, Delete as applicable
- Voice messages: bubble with audio icon + duration label
- In-strand search: overlay search bar, highlight matches in history

## Libraries

- FlatList with `inverted` for tail-anchored scroll
- `@react-native-clipboard/clipboard` for copy
- Media picker integration via callback/context

