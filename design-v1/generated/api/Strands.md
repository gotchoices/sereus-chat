---
provides: ["api:Strands"]
dependsOn:
  - design/specs/api
  - design/specs/screens/connections-list.md
  - design/specs/navigation.md
  - design/stories/managing-connections.md
  - design/stories/discovery.md
  - design/stories/searching-messages.md
usedBy: ["screen:ConnectionsList","screen:ChatInterface"]
---

# API Consolidation: Strands

Procedures

## listStrands()
- Purpose: return the user’s strand summaries for the home list
- Params: none
- Result (array of):
```json
{
  "id": "strand-123",
  "displayName": "Alice",
  "avatarUrl": "https://…", 
  "lastMessage": {
    "previewText": "See you soon",
    "timestamp": "2025-11-10T14:32:00Z"
  },
  "unreadCount": 2
}
```

Notes
- Sorting and filtering handled client-side initially (Recent default)
- Unread badge capped at 99+


