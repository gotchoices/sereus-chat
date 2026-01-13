---
provides: ["screen:mobile:ChatInterface"]
needs: ["domain:Op:Strands.listMessages", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/screens/chat-interface.md
  - design/specs/mobile/navigation.md
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
- Deep link: `sereus://strand/{strandId}?variant=<v>&locale=<tag>`

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

- Header bar: BackButton, PartnerAvatar, PartnerName, CallButton (voice), CallButton (video), SearchButton
- MessageList: virtualized FlatList, MessageBubble components
- Composer: AttachButton, TextInput (multiline, max 4 lines), ActionButton (mic/send toggle)
- AttachmentStrip: horizontal chips with remove X overlay
- EditControls: Cancel (red X), Save (green check) — replaces ActionButton during edit

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

