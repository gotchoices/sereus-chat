---
id: settings
route: Settings
variants: [happy, error]
description: Appearance, language, notifications and storage — for this device.
---

# Settings

Story 41.

## Purpose

The few things that are genuinely the user's to decide about the app itself. It is short, and its
brevity is the point.

## Layout

Four sections and nothing else:

- **Appearance** — light, dark, or the system's
- **Language** — the app's own words
- **Notifications** — default level; a note that per-strand choices override it
- **Storage** — what the app is using, broken down by strand, and the ceiling the user sets

## What is deliberately absent

No account, sign-out, password, linked identity or session list — none was ever created. No privacy
section: who can read a conversation belongs to that strand, and nothing is collected here to opt
out of. The screen does not apologise for being short and does not pad itself.

## Behaviours

- Every setting applies to **this device**; another device may differ
- Changing the default notification level never alters a choice made about a particular strand
- Language changes the app's words immediately; messages are never translated
- Storage lists strands by size, largest first, each a way through to trimming
- Reaching the ceiling offers three things and does nothing unbidden: raise it, trim, or add a
  machine

## States

- **happy**: settings, with current values
- **error**: storage figures unavailable; the rest still works

## Acceptance

- [ ] No account or sign-out affordance exists anywhere
- [ ] Where a setting cannot deliver what it promises — notifications reaching a sleeping phone —
      the limit is stated beside the switch, not in help
- [ ] Per-strand choices are never silently overridden in either direction
- [ ] The storage ceiling is the user's; none is imposed
- [ ] Nothing is deleted on the user's behalf when the ceiling is reached
