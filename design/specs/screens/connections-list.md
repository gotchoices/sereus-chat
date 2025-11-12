---
id: ConnectionsList
route: ConnectionsList
variants: [happy, empty, error]
---

# Spec: Connections List (Home)

## Purpose & Scope
The Home screen shows the user's established threads and provides quick access to search, inviting friends, sorting, and profile. This is the app entry point after first‑launch name modal.

## Layout
This is the home screen so it does not contain a back button.

### Title Bar (top)
- **App Title** Sereus Chat

### Control Bar (top, left → right)
- **Search icon**
  - Action: Push `Search` (SearchInterface)
  - Icon: Magnifying glass
  - Hint text: -none-
- **Add Friends** (Invite)
  - Action: Modal `Invite` (InvitationGenerator)
  - Icon: Person with '+'
  - Hint Add Friends
  - Geometry: Button expands to fill available space in bar
- **Sort icon**
  - Action: Opens sort menu (overlay)
  - Icon: Sort controls
  - Options: Recent (default), Alphabetical, Unread first
  - Persist selection locally

### Content Area (below header → bottom)
- **Threads list** (scrollable)
  - Row shows: avatar/initials, display name, last message preview (1 line, ellipsis), timestamp (relative), unread badge (if >0)
  - Tap row → push `Thread` (ChatInterface)

### Footer Bar (bottom, left → right)
- **QR Scanner**
  - Icon: QR
  - Hint text: -none-
- **Notifications**
  - Icon: Bell
- **Profile avatar** (user’s picture or initials)
  - Action: Push/Modal `Profile` (reuse ProfileSetup for now)

## Behaviors
- **Empty state**: If no threads, show CTA: “Invite a friend to start a thread” + button → Invite modal
- **Pull to refresh**: Refreshes list and previews
- **Unread badge**: Red circular badge at end of row (99+ cap), cleared on entering thread
- **Timestamps**: Relative under 24h (e.g., “2:30 PM”), otherwise day (“Tue”) or date (locale)
- **Sorting**: Applies to the entire list; tiebreak by latest message timestamp desc
- **Long‑press / swipe (future)**: Archive, Delete, Block (defer; not implemented in XML yet)

## States
- Loading: skeleton rows (or simple Loading indicator)
- Empty: empty state with Invite CTA
- Error: inline error banner with Retry

## Accessibility
- Tap targets ≥ 44×44 px
- Text contrast meets WCAG AA
- Icons include accessible labels (Search, Invite, Sort, Profile)

## Data Mapping (examples)
- Row name: connection.displayName
- Preview: thread.lastMessage.previewText
- Timestamp: thread.lastMessage.timestamp
- Unread: thread.unreadCount
- Avatar: connection.avatarUrl (fallback to initials)

## Implementation Notes
- Use a performant list; ensure header actions are visible and accessible
- Buttons use default sizes unless otherwise specified

## Open Questions
- Profile navigation: push vs modal?
- Sort menu placement: simple overlay from header, or anchored popover?
- Empty state messaging copy and iconography?
- Do we need a “New Thread” FAB in addition to header Invite?

## Acceptance Criteria
- [ ] Header shows Search, Invite, Sort, Profile in that order
- [ ] Threads list displays name, preview, timestamp, unread badge
- [ ] Tapping a thread opens `Thread`
- [ ] Invite opens `Invite` modal; Search opens `Search`
- [ ] Sorting updates order according to selection and persists
- [ ] Empty state appears when there are no threads and offers Invite
