---
provides: ["screen:mobile:SearchInterface"]
needs: ["domain:Op:Strands.search", "domain:Entity:Strand", "domain:Entity:Message"]
dependsOn:
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
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

Shared component layer (`src/components/`); theme tokens throughout.

- SearchInput: themed TextInput (surfaceAlt, textMuted placeholder), debounced
- ResultsList: FlatList of `ListRow` (leading `Avatar`, title=name, subtitle=matched preview)
- `EmptyState`: distinct copy for "start searching" vs "no results"

## Implementation Notes

- Debounce input (~300ms) before searching
- Highlight matched text in preview
- Tap result → navigate to ChatInterface with strandId, optionally scroll to matched message
- Filter tabs (future): People / Messages / Media
- Case-insensitive matching

