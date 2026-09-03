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
2. Sort the main list by the persisted preference. The human spec fixes the surface: **tapping the
   sort icon opens an overlay** offering Recent (default), Alphabetical, Unread first — not a
   cycling button.
3. **Muted strands are not promoted by ordinary traffic** — under `recent` they sort by last *read*
   activity, not last message. This is the one place sort order is deliberately not literal.
4. **Being named is not ordinary traffic** — story 10, step 4. A mention restores a strand to its
   real recency even when softly muted; a hard mute holds its place regardless. Quieting a strand
   stopped it interrupting, it did not mean the user wanted to miss being asked something.

## Row precedence

A row shows at most one trailing indicator, in this order:

`mentioned` → `unreadCount` → `muted`

Rationale: being named is the only thing that should be able to interrupt (story 12); an unread
count on a muted strand would re-create the pressure muting removed.

**No draft badge.** The row's preview already reads `Draft: …`, so a badge saying the same is noise;
the slot goes to the mute state instead. (Changed after device review — the spec still lists a
draft badge.)

## Component Inventory

From `src/components/`; all colour and spacing via theme tokens.

- `ListRow` — Avatar (sm) + title + preview + trailing slot
- `Badge` — count / mention dot / muted glyph, by semantic token
- `Avatar` — needs a **group form** (composite or single image) and the name-hash to accept a strand
  title, not just a person's name
- `SectionHeader` — "Pending", "Archived"
- `EmptyState` — first-run copy plus primary action
- `Banner` — error, with retry

## Search (staged — human spec)

Two acts behind one icon, and only the first is free.

1. **Narrow.** Tapping search reveals an inline field; the list filters as the user types, matching
   `title` and member names. Purely client-side over data already held — no adapter call, no
   network, works offline. Member names need `Strands.list()` to carry enough to match on, or a
   cached member list per strand; do not fetch members on keystroke.
2. **Escalate.** Below the narrowed rows, a single row — "Search messages for *term*" — routes to
   `SearchInterface` with the term as its initial query. **Only ever on an explicit tap.** The sweep
   wakes hibernating strands (`domain/sereus.md`), so it must never be triggered by typing.

Debounce the filter (~100 ms) purely for render cost, not for I/O; there is none.

## Re-reading

The screen re-reads on focus and on `useDataRevision()` — a neutral signal from
`src/mock/VariantContext` that bumps when the data source changes beneath the UI. Screens list it as
a load dependency and never inspect it; it never changes in production. It exists because a mock
variant deep link must re-read **without** remounting the navigator: keying the navigator on the
variant resets navigation, so the deep link never reaches its screen.

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
