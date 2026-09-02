---
id: strand-list
route: StrandList
variants: [happy, empty, error]
description: Home. Every strand the user belongs to, ordered so what needs them is found first.
---

# Strand List (Home)

The app opens here — not on the last conversation. Stories 10, 30, 01.

## Purpose

Show every strand the user belongs to, and make the difference between *needs me*, *busy*, and
*quiet* visible without reading anything.

## Layout

- **Header**: search, "New strand", sort
- **Pending** (only when non-empty): invitations sent and not yet taken up, and invitations received
  and not yet answered
- **List**: one row per strand
- **Archived** (collapsed, only when non-empty)
- **Footer**: scan, profile avatar

## A row

| Element | Rule |
|---------|------|
| Avatar | The strand's, not a person's. Group strands show a composite or their own image |
| Title | The strand's name; for a two-party strand, the other member as the user names them |
| Preview | Last message, prefixed with its sender in a strand of more than two |
| Time | Relative under a day, date beyond |
| State | At most one of: **named** (someone mentioned the user), **unread count**, **draft**, **muted**. Named outranks unread |

## Behaviours

- Tap a row → ChatInterface, opening where the user stopped reading
- Long-press a row → mute, archive, leave (story 33); destructive items confirm
- Swipe a row → archive
- Tap search → SearchInterface · "New strand" → InvitationGenerator · avatar → Profile · scan → QrScanner
- Sort: most recent first (default), unread first, alphabetical. The choice persists
- Pull to refresh
- A strand where the user has an unsent draft says so in place of the preview
- Muted strands accumulate silently; they are never reordered to the top by new traffic

## States

- **Normal**: strands, ordered by the chosen sort
- **Empty**: the first-run state. Explains that nothing can happen until the user and somebody else
  agree to a strand, introduces the word, and offers to start one. Not an error, and it does not
  nag on return visits
- **Nothing new**: strands exist, none unread — said plainly rather than dressed up
- **Error**: inline banner, retry; existing rows stay visible

## Acceptance

- [ ] Launch lands here, not on the last strand opened
- [ ] Being named is distinguishable from unread count at a glance
- [ ] A group row's preview names its sender
- [ ] A strand's title never implies a person who is not there
- [ ] Muted strands do not compete for attention but are not hidden
- [ ] Pending invitations are visible and distinguishable from strands
- [ ] The empty state teaches the word "strand" without a glossary
