---
id: chat-interface
route: ChatInterface
variants: [happy, empty, error]
description: One strand's conversation — reading, writing, replying, reacting.
---

# Chat Interface

Stories 04, 10, 11, 12, 13, 20, 21.

## Purpose

The conversation. Familiar to anyone who has used a messaging app, and honest about the few places
this one differs: nothing is reported back to a sender, and the strand's own nature is on show.

## Layout

- **Header**: back, strand title, and beneath it either the member count (groups) or nothing.
  A **status indicator** shows what the strand is — public / can still change / settled — and is
  tappable through to StrandDetail
- **History**: message bubbles, date separators, sender grouping, an unread divider
- **Jump to latest**: appears when the user has scrolled away from the end, with a count of what
  arrived since
- **Composer**: attach (+), text input growing to ~5 lines, send. A reply bar sits above it when
  replying

## History rules

| Rule | Behaviour |
|------|-----------|
| Opening position | Where the user stopped reading — not the top, not forced to the end |
| Unread divider | A line marking the first unread message; persists until the user leaves the strand |
| Date separators | Between days |
| Sender grouping | Consecutive messages from one sender read as one turn; avatar and name once |
| Sender identity | Name and avatar shown on incoming messages **only in strands of more than two** |
| Timestamps | Relative under a day, absolute beyond; shown per group, not per message |
| Order | By the platform's order where available, otherwise the sender's asserted time. **Never presented as authoritative** — see `domain/schema.md` |
| Fetching older | Reaching content this device does not hold shows as *fetching*, never as the start of the conversation |

## Message behaviours

- Long-press own message → Reply, Copy, Edit, Delete
- Long-press another's → Reply, Copy, React
- Tap a reply's quoted excerpt → jumps to the original in place; if it has been removed, says so
- Tap an attachment → MediaViewer
- Reactions appear beneath a bubble with who reacted; tapping shows the list; a user may change or
  remove their own
- `@` in the composer offers the strand's members — and nobody else, because there is nobody else
- A mention renders with the name **this** reader uses for that member

## What is never shown

- Delivery or read status. A message shows only that it is in the conversation
- Any "pending"/"sending" state for the ordinary case of being unreachable — the phone holds the
  strand, so a send is a local write (story 11)
- Link previews. Pasted links stay as text; nothing is fetched
- A "message deleted" placeholder manufactured by the app

## States

- **Normal**: history and composer
- **Empty**: a strand with no messages — a plain invitation to say something
- **Editing**: composer prefilled, save/cancel replace send
- **Replying**: quoted excerpt above the composer, dismissible
- **Selecting**: text selection for copying — not a bulk-action mode
- **Fetching older**: spinner at the head of the list, conversation still usable
- **Unreachable past**: a stated boundary when older content cannot be fetched at all
- **Error**: inline banner with retry; existing history stays visible

## Acceptance

- [ ] Opens where the user stopped reading, with the unread boundary marked
- [ ] Sender names appear on incoming messages only in strands of more than two
- [ ] No delivery or read indicator appears anywhere
- [ ] Sending with nothing reachable produces no pending state
- [ ] A failed *write* keeps the user's text and offers retry
- [ ] Replying carries a reference; following it lands on the original
- [ ] Mentions offer only members of this strand
- [ ] Reactions do not generate notifications
- [ ] Older content being fetched is distinguishable from the conversation's beginning
