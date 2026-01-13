---
provides: ["screen:mobile:SearchInterface"]
needs: ["domain:Op:Strands.search", "domain:Entity:Strand", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/navigation.md
  - design/stories/mobile/searching-messages.md
  - design/stories/mobile/managing-connections.md
---

# Consolidation: SearchInterface

## Purpose

Global search across people (connections) and message content. Selecting a result opens the corresponding strand.

## Route

- `SearchInterface` (push from Home)

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Results found | happy |
| empty | No results | empty |
| error | Search failure | error |

## Data Requirements

- `Strands.search(query)` → `SearchResult[]`
- SearchResult: `{ strandId, partnerName, avatarUrl?, matchedText, timestamp }`

## Component Inventory

- Header: BackButton, SearchInput (auto-focus, debounced)
- ResultsList: FlatList of SearchResultRow
- SearchResultRow: Avatar, Name, MatchedPreview (highlighted), Timestamp
- EmptyState: "No results" message

## Implementation Notes

- Debounce input (~300ms) before searching
- Highlight matched text in preview
- Tap result → navigate to ChatInterface with strandId, optionally scroll to matched message
- Filter tabs (future): People / Messages / Media
- Case-insensitive matching

