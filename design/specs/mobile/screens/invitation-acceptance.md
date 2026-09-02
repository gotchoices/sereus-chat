---
id: invitation-acceptance
route: InvitationAcceptance
variants: [happy, error]
description: See what you are being asked to join, then accept or decline.
---

# Invitation Acceptance

Story 03.

## Purpose

Let somebody see what they are joining **before** they join it — the only moment at which they can
weigh it without having disclosed anything.

## What is shown

- Who is inviting, as they have disclosed themselves — no more
- **What this strand is**, in the same words used everywhere else: public, private and able to
  change, or private and settled
- Whether the person accepting would be able to invite others
- That everything already said in the strand becomes readable by them on joining

## Actions

- **Accept** — the strand exists from this moment
- **Decline** — nothing is created, and the inviter is not told who declined
- **Ask them to close it first** — for a strand that can still change; sends nothing special, it
  simply returns the user to whatever channel they came from with the request in mind

## When it will not work

An invitation already used, expired or cancelled says so plainly and offers no retry that cannot
succeed. It is not framed as the user's mistake.

## States

- **happy**: a live invitation with its terms
- **error**: spent, expired, cancelled, or unreadable

## Acceptance

- [ ] The strand's nature is visible before accepting, not after
- [ ] The user is told they will hold everything already said
- [ ] Declining creates nothing and reveals nothing to the inviter
- [ ] A spent or expired invitation is explained plainly, without blame or a dead retry
