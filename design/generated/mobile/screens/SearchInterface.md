---
provides: ["screen:mobile:SearchInterface"]
needs: ["domain:Op:Strands.search", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/screens/search-interface.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/overview.md
  - design/specs/domain/interfaces.md
  - design/stories/mobile/32-finding-something.md
  - design/stories/mobile/10-catching-up.md
---

# Consolidation: SearchInterface

## Purpose

Progressive search over one strand or all of them.

## Route

- `SearchInterface` — push from the home header (all) or the chat header (this strand)
- Params: `{ strandId? }` — presence selects the scope
- Mock: `sereus://screen/SearchInterface?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| idle | No query yet | — |
| searching | Sweep running, some results in | happy (streamed) |
| happy | Sweep complete, results found | happy |
| partial | Complete except unreachable strands | happy + `skipped` |
| empty | Complete, nothing matched | empty |
| error | Search could not run | error |

**`partial` is not an error state.** It renders results plus a line naming how many strands could
not be reached.

## Data Requirements

The adapter must expose search as a **stream, not a promise**:

```
Strands.search(query, { strandId?, kinds?, from?, to?, senderId? })
  → AsyncIterable<SearchBatch>
SearchBatch { results: SearchHit[], strandsSearched, strandsTotal, strandsSkipped }
SearchHit { strandId, strandTitle, messageId, senderName, snippet, matchRange, timestamp }
```

This shape exists because of the platform, not by preference: there is no cross-strand index, and
most strands are hibernating ([sereus.md](../../../specs/domain/sereus.md)). A promise-shaped API would force the screen to block
on the slowest strand and would make partial results impossible to show.

## Implementation Notes

- Render each batch as it arrives; keep a stable sort within what has arrived, and do not reorder
  earlier results when later ones land — a moving list is unusable while it is being read.
- Progress line: "searched 6 of 14". On completion it becomes either nothing, or the skipped count.
- Filters are passed **into** the query so they narrow the sweep, not applied client-side afterwards.
- In-strand scope skips the sweep entirely and is fast; make it the default entry from a conversation.
- Debounce input ~300 ms; cancel the in-flight iterator on a new query — an abandoned sweep must not
  keep waking strands.
- Result rows lead with the strand title in cross-strand scope, omit it in in-strand scope.
- Tapping a hit routes to ChatInterface with `{ strandId, anchorMessageId }`.

## Libraries

- `FlatList` with incremental append
- `AbortController` (or equivalent) threaded through the adapter for cancellation
