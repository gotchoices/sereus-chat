---
id: invitation-generator
route: InvitationGenerator
variants: [happy, empty, error]
description: Make and share an invitation; see the ones still outstanding.
---

# Invitation

Stories 02, 05, 31.

## Purpose

Two jobs on one screen: **start a strand**, and **add somebody to one that exists**. Which one is
determined by how the user arrived.

## Starting a strand

1. **Private or public.** Private means only people who are invited; public means anyone with the
   link can join, and nobody can be removed. Stated in those terms, not as a toggle label.
2. **The invitation.** One decision on it: whether whoever takes it up can also invite others.
3. The invitation appears as a QR code and a link.

The screen says plainly that nothing exists yet — there is no strand until somebody accepts.

## Adding to an existing strand

Only offered to members who can invite. Same single decision, plus, before it is issued, a plain
statement of what the newcomer will be able to read: everything, including what was said before
they arrived, with a sense of how much that is.

## Sharing

- Show the QR for somebody present
- Copy the link, or hand it to the device's share sheet
- **Posting into the strand itself** is offered last and described honestly: an invitation works for
  whoever holds it, so putting it in the conversation gives every member a one-off ability to bring
  somebody in

## Outstanding

Everything issued and not yet taken up: what it was for, when it expires, and whether it has been
spent. Each can be shared again or abandoned. Outstanding invitations are not strands and never
appear as though they were.

## States

- **happy**: an invitation, freshly minted, with any outstanding ones beneath
- **empty**: no outstanding invitations — the ordinary state after a first send
- **error**: an invitation could not be created

## Acceptance

- [ ] The private/public choice is expressed as who can join and who can be removed
- [ ] Every invitation carries one decision: whether its holder can invite others
- [ ] Adding to an existing strand states what history the newcomer will hold, before it is issued
- [ ] Posting an invitation into a strand is described as handing every member an admission
- [ ] Outstanding invitations are visible, expiring, re-shareable and abandonable
- [ ] Nothing implies a strand exists before somebody accepts
