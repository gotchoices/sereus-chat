---
id: ChatInterface
route: ChatInterface
variants: [happy, empty, error]
---

# Spec: Chat Interface

## Purpose & Scope
The Chat Interface shows a single thread’s conversation and provides controls to compose and send messages, place calls, and search within the thread. Opens when a user taps a thread in the Home (Connections List) screen.

## Layout
This is a pushed screen from Home (shows a Back arrow, not a root screen).

### Top Control Bar (top, left → right)
- Back arrow
- Partner avatar/icon
- Partner name (single line, ellipsis if long)
- Expandable padding (fills remaining space)
- Phone icon (voice call)
- Camera icon (video call)
- Search icon (search messages)

### Message History Area (middle)
- Fills most of the screen below the control bar
- Vertically scrollable history
- Message bubbles aligned left/right depending on sender
- Group contiguous messages by same sender (reduced spacing)
- Show timestamps (compact, relative if recent)
- Compact vertical spacing between bubbles to conserve space
- Text and attachments render as separate bubbles (no mixed text+attachment in one bubble)

### Bottom Bar (message composition, left → right)
- "+" icon (attach files, photos, video, documents, location) → opens toast-style `media-picker`
- Message entry box (single line, expands up to 4 lines, then scrolls)
- Right action icon:
  - Microphone when no text and no attachments
  - Send (paper airplane) when there is text or at least one provisional attachment

### Provisional Attachment Strip (composer context)
- When attachments are selected via `media-picker`, show a horizontal strip above the composer input with chips/thumbnails for each attachment (image/video/file/location).
- Each attachment shows a small “X” delete button overlaid in the upper-right corner; no inline “Remove” text.
- Chips are sized to fit on a single row without overlap; truncate titles or enable horizontal scroll when necessary.

## Behaviors
- Back: Returns to Home list
- Voice call: Initiates voice call (pushes/overlays call UI)
- Video call: Initiates video call (pushes video-call screen)
- Search: Enters in-thread search mode (highlights matches in history)
- Attachments: Tap “+” opens `media-picker` toast (Camera, Gallery, File, Location). OS/library UIs handle selection.
- Provisional attachments: After selection, attachments appear in the strip (not sent). User can continue typing; all content remains provisional until Send.
- Remove attachment: Tap the “X” overlay on a chip/thumbnail to detach it from the message.
- Icon switching: Mic ↔ Send based on presence of text or attachments (Send if any present).
- Message send: Tapping Send posts the current text and all provisional attachments, then clears the composer and strip.
- Voice messages: render as a message bubble with a voice icon and duration label (e.g., “🔊 0:15”).
- Long press on message: Copy, Delete, Edit (if own message)
- Read receipts (future): Optional small status per bubble

## States
- Normal: History + composer visible
- Composing: Entry box expanded (up to 4 lines)
- Recording: Microphone active (timer indicator) when no attachments and mic icon is visible
- Loading: Skeleton or spinner while history loads
- Error: Inline error banner with Retry
- Empty: Show placeholder “No messages yet” centered

## Accessibility
- Tap targets ≥ 44×44 px
- Sufficient color contrast (WCAG AA)
- Avatar and icons include accessible labels (Back, Call, Video, Search, Attach, Microphone)
- Support VoiceOver focus through history and composer controls

## Data Mapping (examples)
- Partner name: thread.partner.displayName
- Partner avatar: thread.partner.avatarUrl (fallback initials)
- Messages: thread.messages[]
  - text: message.text
  - sentAt: message.timestamp
  - fromSelf: message.senderId == me.id
  - status: message.status (sent, delivered, read)
- Unread count: thread.unreadCount (cleared on open)

## Open Questions
- Call UI: push full screen vs compact overlay?
- Voice recording gestures: hold-to-record vs toggle-to-record?
- Edit/delete permissions and retention policy?
- In-thread search UI placement (overlay bar vs inline)?
- Read receipts indicators and placement?

## Acceptance Criteria
- [ ] Top control bar shows: Back, avatar, name, spacer, Phone, Camera, Search
- [ ] History scrolls and aligns bubbles by sender with timestamps
- [ ] Composer shows “+”, expanding text input, and a right action icon that switches between Microphone and Send
- [ ] Tapping “+” opens the `media-picker` toast; selecting items returns provisional attachments to the composer strip
- [ ] User can remove provisional attachments via “X” overlay in the upper-right of each chip/thumbnail
- [ ] Tapping Send sends text plus all provisional attachments; composer and strip clear
- [ ] Text and attachments render as separate bubbles in history (no mixed text+attachment)
- [ ] Tapping Phone/Camera initiates appropriate flows
- [ ] Search enters in-thread search mode and highlights matches
- [ ] Screen adheres to accessibility targets and contrast
