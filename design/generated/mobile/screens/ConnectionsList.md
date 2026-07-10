---
provides: ["screen:mobile:ConnectionsList"]
needs: ["domain:Op:Strands.list", "domain:Entity:Strand"]
dependsOn:
  - design/specs/mobile/screens/connections-list.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/stories/mobile/discovery.md
  - design/stories/mobile/managing-connections.md
  - design/stories/mobile/responding.md
  - design/stories/mobile/deleting-channels.md
---

# Consolidation: ConnectionsList

## Purpose

Home screen listing all strands/connections with quick access to Search, Invite, Sort, and Profile.

## Route

- `ConnectionsList` (root)
- No deep link; primary entry after onboarding

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Strands present | happy |
| empty | No strands | empty |
| error | Load failure | error |

## Data Requirements

- `Strands.list()` → `Strand[]`
- Strand: `{ id, partner: { displayName, avatarUrl }, lastMessage: { previewText, timestamp }, unreadCount }`

## Component Inventory

Built from the shared component layer (`src/components/`, see
`specs/mobile/components/index.md`); all color/spacing via theme tokens.

- Controls row: `IconButton` ×3 — Search (bordered), Add Friends (accent), Sort (bordered)
- StrandList: FlatList of `ListRow`
- `ListRow`: leading `Avatar` (name-hashed color), title=name, subtitle=preview (1 line), trailing `Badge` (unread count)
- Footer bar: `IconButton` ×3 — QR scanner, Notifications, Profile
- `EmptyState`: icon + title + hint + invite CTA
- `Banner` (error variant) with retry on load failure
- SortOverlay: cycles Recent/Alphabetical/Unread (icon reflects mode)

## Implementation Notes

- Unread: `Badge mode="count"` (danger token), caps at "99+"
- Timestamps: relative (<24h) or day/date
- Sorting persists locally (AsyncStorage)
- Pull-to-refresh via RefreshControl (tint = theme.textSecondary)
- Tap row → navigate to ChatInterface with strandId
- Long-press/swipe (future): archive, delete, block actions

