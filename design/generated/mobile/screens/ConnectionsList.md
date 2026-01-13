---
provides: ["screen:mobile:ConnectionsList"]
needs: ["domain:Op:Strands.list", "domain:Entity:Strand"]
dependsOn:
  - design/specs/mobile/screens/connections-list.md
  - design/specs/mobile/navigation.md
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

- Header bar: SearchButton, InviteButton ("Add Friends"), SortButton
- StrandList: FlatList of StrandRow components
- StrandRow: Avatar, Name, Preview (1 line ellipsis), Timestamp, UnreadBadge
- Footer bar: QRScannerButton, NotificationsButton, ProfileAvatar
- EmptyState: CTA with invite button
- SortOverlay: menu with Recent/Alphabetical/Unread options

## Implementation Notes

- Unread badge: red circle, cap at "99+"
- Timestamps: relative (<24h) or day/date
- Sorting persists locally (AsyncStorage)
- Pull-to-refresh via RefreshControl
- Tap row → navigate to ChatInterface with strandId
- Long-press/swipe (future): archive, delete, block actions

