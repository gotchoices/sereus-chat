---
id: strand-detail
route: StrandDetail
variants: [happy, empty, error]
description: Who is in a strand, what it is, and what the user can do about it.
---

# Strand Detail

Stories 31, 33, 05, 40.

## Purpose

Answer two questions the user has about a conversation: **who is reading this**, and **on whose
sufferance am I here**. Everything else on the screen is secondary.

## Layout

- **Header**: strand title (editable by the user, locally)
- **What this is**: the status indicator, in a sentence, not a badge alone
- **Members**: everyone, managers marked, the user marked
- **Shared here**: count and total size → StrandMedia
- **This conversation**: mute, archive, leave, forget entirely
- **Managers only**: add someone, give up the ability

## What this is

The status is one of three, stated plainly and updated when it changes:

| State | Sentence |
|-------|----------|
| Public | "Anyone with the link can join. Nobody can be removed." |
| Private, can change | "Only invited people are here. *N* of them can add or remove anyone — including you." |
| Private, settled | "Nobody can be added or removed. This is who it will always be." |

It reports **recorded** state only. A manager who has stopped appearing is still a manager; the app
never infers that somebody is gone, and never softens "can change" into "settled" because things
have been quiet.

## Members

- Each row: avatar, the name **this user** has for them, "manager" where applicable, "you" for self
- Rows are **not** a way to reach anyone. Tapping one offers only: start a new strand with them —
  which mints an invitation they must accept — and rename them locally
- No private-message action exists, because no private conversation exists
- Ordering: the user first, then managers, then the rest

## Actions

| Action | Who | Behaviour |
|--------|-----|-----------|
| Mute | anyone | Soft (quiet unless named) or hard (quiet regardless) |
| Archive | anyone | Local, reversible, hides from the main list |
| Leave | anyone | Confirms; explains the strand continues without them and that returning is possible while they keep what identifies them |
| Forget entirely | anyone | Confirms **twice**; permanent; states that a later return is as a new member |
| Add someone | managers | → InvitationGenerator with this strand as context |
| Give up the ability | managers | Confirms; states it is permanent, and warns when another manager remains that they can still remove the user |
| Remove a member | managers | Confirms; states it stops what follows and undoes nothing already read |

There is **no delete-strand action**. It does not exist.

## States

- **happy**: a group, several members, at least one manager
- **empty**: a two-party settled strand — a short list and few actions, which is the ordinary case
- **error**: members cannot be loaded; the strand's own state still shows if known

## Acceptance

- [ ] The status is legible without interpretation and changes when the strand changes
- [ ] "Can change" is never softened to "settled" on the strength of inactivity
- [ ] A member row offers no private message and no direct invitation
- [ ] Posting an invitation into the strand is described as handing every member a one-off admission
- [ ] Giving up the ability warns about a remaining manager before it is done
- [ ] Removal is described as stopping what follows, not undoing what was read
- [ ] No action anywhere claims to delete the strand for other people
