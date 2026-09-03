---
provides: ["screen:mobile:StrandMedia"]
needs: ["domain:Op:Strands.listAttachments", "domain:Entity:Attachment"]
dependsOn:
  - design/specs/mobile/screens/strand-media.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/stories/mobile/21-receiving-media.md
  - design/stories/mobile/32-finding-something.md
  - design/stories/mobile/41-settings.md
---

# Consolidation: StrandMedia

## Purpose

Everything shared in one strand, filterable, with the storage it occupies and a way to trim.

## Route

- `StrandMedia` — push from StrandDetail, or from a search result
- Mock: `sereus://screen/StrandMedia?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Attachments present | happy |
| empty | Nothing shared here | empty |
| error | Listing fails | error |

## Data Requirements

`Strands.listAttachments(strandId, { kind? })` → `Attachment[]` plus

```
Attachment { id, messageId, type, uri|null, mimeType, name,
             byteSize|null, durationMs|null, locality: 'local'|'fetching'|'unreachable' }
StorageUse { strandId, bytes, itemCount }
```

`locality` is the third-state field from `domain/overview.md`. The adapter must supply it; the
screen must never infer absence from a null `uri`.

## Item rendering

| locality | Render |
|----------|--------|
| local | Thumbnail |
| fetching | Skeleton tile with progress; grid stays scrollable |
| unreachable | Labelled placeholder — "not reachable right now". Never a broken-image glyph and never an empty tile |
| local, but no thumbnail | A file or voice note that *is* here: show its **name**. This is **not** a locality state, and labelling it "not reachable" tells the user something false — a live bug found on device |

## Implementation Notes

- Grid: `FlatList numColumns={3}` for images/video; a single-column list for files and voice, since
  a filename in a square tile is unreadable.
- Filter is a segmented control; it also becomes the swipe set handed to MediaViewer, so what the
  user sees and what they can swipe through match.
- Long-press → save to device (OS library) or remove local copy. The remove copy explains once,
  briefly, that other members are unaffected — then stops explaining.
- Trim: offer oldest-first and by-kind, each with the bytes recovered *before* confirming. This is
  the user's ceiling from Settings being enforced by hand.
- Storage figure is shared with StrandDetail — one selector, both screens.

## Open

Whether dropping a local copy weakens what the strand can serve others is unresolved
([sereus.md](../../../specs/domain/sereus.md)). Until it is, trimming is offered without claiming it is free for the cohort.

## Libraries

- `FlatList` with `numColumns`, `react-native-fast-image` (or equivalent) for thumbnails
