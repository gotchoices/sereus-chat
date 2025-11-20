---
provides: ["screen:SearchInterface"]
needs: ["api:Strands"]
dependsOn:
  - design/specs/screens/search-interface.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
usedBy:
  - "route:SearchInterface"
---

# Consolidation: SearchInterface

Purpose
- Search people and recent message previews. Selecting a result opens the corresponding strand.

Layout/Behavior
- Top search input (debounced/instant)
- Results list: avatar/initials, name, last message preview
- Tap → push ChatInterface with `{ strandId, name }`


