---
provides: ["screen:mobile:StrandList"]
needs: ["domain:Op:Strands.list", "domain:Entity:Strand", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/screens/strand-list.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/specs/domain/ops.md
  - design/specs/domain/schema.md
  - design/stories/mobile/01-first-run.md
  - design/stories/mobile/10-catching-up.md
  - design/stories/mobile/11-writing-a-message.md
  - design/stories/mobile/30-my-strands.md
  - design/stories/mobile/33-managing-a-strand.md
---

# Consolidation: StrandList

## Purpose

Root screen. Renders every strand the user belongs to, ordered for triage, with pending invitations
and archived strands as separate sections.

## Route

- `StrandList` — stack root
- Mock deep link: `sereus://screen/StrandList?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | One or more strands | happy |
| empty | No strands at all — first run | empty |
| nothingNew | Strands exist, none unread | happy (derived) |
| error | `Strands.list()` rejects | error |

`nothingNew` is derived in the screen, not a separate fetch: `strands.every(s => !s.unreadCount && !s.mentioned)`.

## Data Requirements

`Strands.list()` → `StrandSummary[]`:

```
{ id, title, avatarUri|null, isGroup, memberCount,
  lastMessage: { previewText, senderName|null, timestamp } | null,
  unreadCount, mentioned: bool, muted: 'none'|'soft'|'hard',
  draftPreview: string|null, archived: bool, pending: bool }
```

Notes for the adapter:

- `title` is the app's, not sereus's — no strand-title slot exists upstream (`schema.md`). For a
  two-party strand fall back to the other member's name; for a group without a name, compose from
  member names.
- `senderName` is null when `memberCount <= 2`; the row omits the prefix.
- `mentioned` is app-derived from message content, not a platform signal.
- `draftPreview` comes from device-local storage, never from the strand DB (story 11).
- Pending invitations are a **separate** adapter call (`Invitations.listOutstanding()`), not entries
  in this array; they render in their own section.

## Ordering and sectioning

1. Partition: `pending` → Pending section; `archived` → Archived (collapsed); rest → main list.
2. Sort the main list by the persisted preference (`recent` default, `unread`, `alpha`).
3. **Muted strands are never promoted by new traffic** — under `recent` they sort by last *read*
   activity, not last message. This is the one place sort order is deliberately not literal.

## Row precedence

A row shows at most one trailing indicator, in this order:

`mentioned` → `unreadCount` → `draft` → `muted`

Rationale: being named is the only thing that should be able to interrupt (story 12); an unread
count on a muted strand would re-create the pressure muting removed.

## Component Inventory

From `src/components/`; all colour and spacing via theme tokens.

- `ListRow` — Avatar (sm) + title + preview + trailing slot
- `Badge` — count / mention dot / muted glyph, by semantic token
- `Avatar` — needs a **group form** (composite or single image) and the name-hash to accept a strand
  title, not just a person's name
- `SectionHeader` — "Pending", "Archived"
- `EmptyState` — first-run copy plus primary action
- `Banner` — error, with retry

## Implementation Notes

- FlatList keyed on strand id; sections via `SectionList` when Pending or Archived are non-empty.
- Long-press → action sheet: Mute (soft/hard submenu), Archive, Leave. Leave confirms and routes its
  consequences per story 33; **no delete option exists**.
- Swipe-to-archive with undo toast — archive is local and reversible, unlike leaving.
- Sort preference persists device-locally (settings are per-device, story 41).
- Poll cadence follows the adapter (~2 s today; the adapter hides that no change feed exists).
- Empty state copy is load-bearing — it is where "strand" is introduced (story 01). Keep it in
  i18n strings, not inline.

## Libraries

- `SectionList` from react-native
- `react-native-gesture-handler` Swipeable for row actions
