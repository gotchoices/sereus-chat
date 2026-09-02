---
provides: ["screen:mobile:ChatInterface"]
needs: ["domain:Op:Strands.listMessages", "domain:Entity:Message", "domain:Entity:Attachment", "domain:Entity:Member"]
dependsOn:
  - design/specs/mobile/screens/chat-interface.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/specs/domain/ops.md
  - design/specs/domain/schema.md
  - design/stories/mobile/04-our-first-conversation.md
  - design/stories/mobile/10-catching-up.md
  - design/stories/mobile/11-writing-a-message.md
  - design/stories/mobile/12-replying-and-mentioning.md
  - design/stories/mobile/13-correcting-a-message.md
  - design/stories/mobile/20-sending-media.md
  - design/stories/mobile/21-receiving-media.md
---

# Consolidation: ChatInterface

## Purpose

One strand's conversation. Reading, composing, replying, reacting, correcting.

## Route

- `ChatInterface` — push from StrandList; deep link `sereus://strand/{id}`
- Mock: `sereus://screen/ChatInterface?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Messages present | happy |
| empty | No messages yet | empty |
| error | `listMessages` rejects | error |
| editing / replying / fetchingOlder / unreachablePast | Screen-local | — |

## Data Requirements

`Strands.listMessages(strandId, { before?, limit })` → `Message[]`

```
Message { id, memberId, content, timestamp, replyToId|null,
          editedAt|null, attachments: Attachment[], reactions: Reaction[] }
Reaction { memberId, symbol }
Attachment { id, type, uri, mimeType, name, byteSize|null, durationMs|null }
```

Members come from `Strands.listMembers(strandId)` and are cached per strand for name/avatar lookup.

**No `status` field** — the column was removed (`domain/schema.md`). Nothing in this screen may
render delivery or read state.

## Derived, not fetched

| Thing | How |
|-------|-----|
| Unread divider | First message whose id is after the stored read cursor for this strand |
| Read cursor | **Device-local** today. No party-private home exists upstream (sereus#6) |
| Date separators | Day boundary between adjacent messages |
| Sender grouping | Same `memberId`, gap under 5 min, no separator between |
| Mention of me | Scan `content` for a member-reference token resolving to my member id |
| Draft | Device-local per strand; never written to the strand DB until send |

## Ordering

Order by the platform's commit order where the adapter can expose it; otherwise by `timestamp`,
tie-broken by `id`. **The adapter owns this decision** so the screen never sorts on a clock it
should not trust. See `domain/schema.md` → Ordering, and sereus#5.

## Send path

1. Write locally through the adapter. The phone holds the strand, so this is a normal write.
2. The message appears immediately, indistinguishable from any other. **No optimistic-pending
   styling** — there is nothing to be pending on.
3. Only a genuine write failure surfaces: keep the composer text, show a retry, do not clear.

## Component Inventory

- `MessageBubble` — outgoing (accent) / incoming (surfaceAlt); optional sender name (groups);
  attachment slot; reaction strip; edited marker. **No status tick** — remove if present
- `ReplyQuote` — inside a bubble, tappable, with a removed-original state
- `UnreadDivider`, `DateSeparator` — thin labelled rules
- `JumpToLatest` — floating pill with a count
- `Composer` — attach IconButton, growing TextInput, send IconButton, reply bar slot
- `MentionPicker` — inline list over the composer, sourced from strand members only
- `ReactionBar` / `ReactionSheet` — attribution is required; no anonymous tallies
- `EmptyState`, `Banner`

## Implementation Notes

- Inverted FlatList for tail anchoring; `maintainVisibleContentPosition` when prepending older pages.
- Opening scroll: to the read cursor, not to the end. `initialScrollIndex` with `getItemLayout`
  where possible, otherwise scroll after first layout.
- Older pages fetch on head-reach; distinguish three outcomes — got more, nothing more exists,
  cannot reach right now (`interfaces.md` error surfaces). The third is a labelled boundary, never
  an end-of-conversation state.
- Reactions: an open symbol set (any character the keyboard can produce), not a curated palette —
  recorded in stories STATUS §G.
- Mentions store a member reference, not text, so each reader renders their own name for that member.
- Edit is in place with no version chain (`domain/schema.md`); delete removes the row and the screen
  renders no tombstone of its own.
- Attachment tap → MediaViewer with the strand's media as the swipe set.

## Libraries

- FlatList (`inverted`), `react-native-gesture-handler`
- `@react-native-clipboard/clipboard`
