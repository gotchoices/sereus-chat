---
id: strand-list
route: StrandList
variants: [happy, empty, error]
description: Home. Every strand the user belongs to.
---

# Strand List (Home)

Stories 10, 30, 01.

## Layout

- **Header**: search icon, "New strand" button, sort icon
- **List**: rows with avatar, title, last message preview, timestamp, unread badge
- **Footer**: QR scanner, profile avatar

## One row per strand

A strand is one row: a container for its members and its outstanding invitations. Invitations
never get rows of their own. A strand nobody else has joined is still one row (story 30, path F).

## Behaviours

- Tap a row → the conversation
- **Tap sort → overlay with options: Recent, Alphabetical, Unread first.** The choice is remembered
- Pull to refresh

## Search

Two things, staged, and not the same act.

**Tapping search opens a field on this screen and narrows the list as the user types.** It matches
strand names and member names. It is instant, needs nothing reachable, and never leaves this screen.

**Beneath the narrowed list, one row offers to search what was said** — "Search messages for
*term*". That is the only way into message search from here, and it is always an explicit tap.
Never start it on the user's behalf: it goes through every strand and wakes the ones that are
asleep.

Searching inside a single conversation stays where it is, in that conversation's header.
