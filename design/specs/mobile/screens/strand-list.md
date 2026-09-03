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

## Behaviours

- Tap a row → the conversation
- **Tap sort → overlay with options: Recent, Alphabetical, Unread first.** The choice is remembered
- Pull to refresh
