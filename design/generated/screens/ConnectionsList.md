---
provides: ["screen:ConnectionsList"]
needs: ["api:Strands"]
dependsOn:
  - design/specs/screens/connections-list.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
  - design/specs/global/toolchain.md
  - design/specs/global/ui.md
  - design/specs/global/dependencies.md
  - design/specs/global/general.md
  - design/stories/discovery.md
  - design/stories/managing-connections.md
  - design/stories/searching-messages.md
  - design/stories/responding.md
  - design/stories/deleting-channels.md
  - design/stories/editing-messages.md
  - design/stories/sending-media.md
  - design/stories/video-call.md
  - design/stories/profile-management.md
---

# Consolidation: ConnectionsList

Purpose
- Home list of strands/connections with quick access to Search, Invite, Sort, and Profile.

States
- happy: strands present
- empty: no strands → CTA to Invite
- error: inline banner with Retry

Layout and Behaviors (from specs + stories)
- Header actions: Search (push SearchInterface), Invite (modal InvitationGenerator), Sort (overlay), Profile (push/modal ProfileSetup)
- List rows: avatar/initials, displayName, last message preview (1 line, ellipsis), relative timestamp, unread badge (99+ cap)
- Tap row → push ChatInterface
- Pull-to-refresh updates list
- Sorting: Recent (default), Alphabetical, Unread first (persist locally)

Data requirements
- api:Strands → listStrands(): returns array of { id, displayName, avatarUrl?, lastMessage: { previewText, timestamp }, unreadCount }

Deep links
- N/A for ConnectionsList itself; primary entry after onboarding


