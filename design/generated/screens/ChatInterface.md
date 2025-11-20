---
provides: ["screen:ChatInterface"]
needs: ["api:Strands"]
dependsOn:
  - design/specs/screens/chat-interface.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
  - design/specs/global/toolchain.md
  - design/specs/global/ui.md
  - design/specs/global/dependencies.md
  - design/specs/global/i18n.md
  - design/stories/responding.md
  - design/stories/searching-messages.md
  - design/stories/sending-media.md
  - design/stories/video-call.md
usedBy:
  - "route:ChatInterface"
---

# Consolidation: ChatInterface

Purpose
- Strand conversation view with message history and composer. Access to voice/video call and in‑strand search.

States
- happy: messages present
- empty: no messages yet
- error: inline banner with Retry
- composing: input expands up to 4 lines, then scrolls

Layout and Behaviors (from specs + stories)
- Header (navigator): avatar/initial + partner name; actions: Voice call, Video call, Search
- History: scrollable bubbles, align left/right by sender, compact timestamps; contiguous messages by same sender reduce spacing
- Composer: "+" attach, multiline text input (expand to ~4 lines), right action toggles mic/send
- Provisional attachments: chip/thumbnail strip above composer with remove “X”
- Long press (future): copy/delete/edit for own messages

Data requirements
- api:Strands → listMessages(strandId): returns ordered array of { id, strandId, sender, text, timestamp, outgoing? }
- Unread count cleared on entering the strand

Deep links
- `app://chat/:strandId?variant=<v>&locale=<tag>` to open a specific strand and variant/locale


