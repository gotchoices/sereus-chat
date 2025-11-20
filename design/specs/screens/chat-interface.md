---
id: ChatInterface
route: ChatInterface
variants: [happy, empty, error]
---

# Spec: Chat Interface

## Purpose & Scope
The Chat Interface shows a single strand’s conversation and provides controls to compose and send messages, place calls, and search within the strand. Opens when a user taps a strand in the Home (Connections List) screen.

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
- Search: Enters in-strand search mode (highlights matches in history)
- Attachments: Tap “+” opens `media-picker` toast (Camera, Gallery, File, Location). OS/library UIs handle selection.
- Provisional attachments: After selection, attachments appear in the strip (not sent). User can continue typing; all content remains provisional until Send.
- Remove attachment: Tap the “X” overlay on a chip/thumbnail to detach it from the message.
- Icon switching: Mic ↔ Send based on presence of text or attachments (Send if any present).
- Message send: Tapping Send posts the current text and all provisional attachments, then clears the composer and strip.
- Voice messages: render as a message bubble with a voice icon and duration label (e.g., “🔊 0:15”).
- Long press on message: Copy, Delete, Edit (if own message). Edit is inline (no separate screen).
- Per-message overflow (three-dot) menu:
  - Others’ messages: Reply, Copy (more actions can be added later)
  - My messages: Edit, Delete, Copy
  - Long-press may also open the same menu on touch devices; overflow icon must be visible and accessible to support simulator/desktop environments.
- Read receipts (future): Optional small status per bubble

## States
- Normal: History + composer visible
- Composing: Entry box expanded (up to 4 lines)
- Recording: Microphone active (timer indicator) when no attachments and mic icon is visible
- Loading: Skeleton or spinner while history loads
- Error: Inline error banner with Retry
- Empty: Show placeholder “No messages yet” centered
 - Editing (inline): Show an editing banner above the composer with Cancel/Save; prefill composer with the existing message text; highlight the target bubble; only own messages can be edited. Optional deep link `?editing=<messageId>` enters edit state for demos/tests.

## Accessibility
- Tap targets ≥ 44×44 px
- Sufficient color contrast (WCAG AA)
- Avatar and icons include accessible labels (Back, Call, Video, Search, Attach, Microphone)
- Support VoiceOver focus through history and composer controls

## Data Mapping (examples)
- Partner name: strand.partner.displayName
- Partner avatar: strand.partner.avatarUrl (fallback initials)
- Messages: strand.messages[]
  - text: message.text
  - sentAt: message.timestamp
  - fromSelf: message.senderId == me.id
  - status: message.status (sent, delivered, read)
- Unread count: strand.unreadCount (cleared on open)

## Open Questions
- Call UI: push full screen vs compact overlay?
- Voice recording gestures: hold-to-record vs toggle-to-record?
- Edit/delete permissions and retention policy?
- In-strand search UI placement (overlay bar vs inline)?
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
- [ ] Search enters in-strand search mode and highlights matches
- [ ] Long-press on own message shows Edit; entering Edit shows an inline banner with Cancel/Save and the composer prefilled; Save updates the message in-place; Cancel restores previous composer state
- [ ] Each message has a visible overflow menu button (three dots):
  - Others’ messages: Reply, Copy
  - Own messages: Edit, Delete, Copy
- [ ] Screen adheres to accessibility targets and contrast
