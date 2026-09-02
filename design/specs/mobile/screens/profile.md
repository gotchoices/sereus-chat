---
id: profile
route: Profile
variants: [happy, error]
description: What other people see of me, and the way through to settings and my machines.
---

# Profile

Story 40.

## Purpose

Control what other people see, and reach the two things that sit behind it.

## Layout

- **Avatar** — large, with a way to change it
- **Name** — what others see; a display name, not a username, nothing reserved or unique
- **Shared / not shared** — plainly marked: name and picture go to the people in your strands;
  anything else stays on this device
- **Rows**: Settings · My machines (CadreManager)

## Behaviours

- Change the picture from camera, library or files; remove it and fall back to initials
- An image too large offers a way forward rather than a refusal
- Saving updates the user's appearance wherever they are shown
- Leaving with unsaved changes confirms
- The screen states, once, that in a strand which can still grow, people the user has never met may
  come to see this

## States

- **happy**: a profile with a name, with or without a picture
- **error**: changes cannot be saved; the user's input is kept

## Acceptance

- [ ] It is clear which fields other people see and which never leave the device
- [ ] Removing the picture falls back to initials
- [ ] The name reads as a display name, with no suggestion of uniqueness or registration
- [ ] Unsaved changes are never lost silently
- [ ] Cadre management is reachable but is not designed here
