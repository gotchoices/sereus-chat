---
id: invitation-generator
route: InvitationGenerator
variants: [happy, empty, error, unreachable]
description: Make and share an invitation.
---

# Invitation Generator

Stories 02, 05. Terms per story 02 (amended 2026-10-02).

## Layout

- **Link display**: read-only deep link with a copy icon
- **QR toggle**: show/hide the QR code, default on
- **QR preview**: scannable when the toggle is on
- **Share button**: native share sheet
- **Regenerate**: mint a new token

## Terms of the invitation (story 02 step 3, paths C and F)

- **One summary line**, always visible above "Make an invitation": who can use it, how long it is
  good for, and whether they can add and remove people. Example: "For one person · good for 1 week
  · they cannot add or remove anyone".
- **Defaults by strand kind:**

  | Strand | Who can use it | Good for |
  |---|---|---|
  | Private | One person (`totalUses: 1`) | 1 week |
  | Open to anyone | Anyone with the link (no limit) | 1 month |

  Choosing the strand kind on a new strand resets the terms to that kind's defaults.
- **"Change"** beside the line opens three short choices; nothing else on the screen changes:
  - who can use it: one person / anyone with the link;
  - good for: 1 day / 1 week / 1 month;
  - whether they can add and remove people (the existing card).
- **A warning, not a block,** when "anyone with the link" is combined with adding and removing
  people: everyone who finds the link can bring in, or remove, anyone, including the inviter.
- **Outstanding invitations** show, for one usable by anyone, how many have used it and when it runs
  out. It stays listed until it runs out or the user takes it off the list. One for a single person
  leaves the list once it is used. Neither can be recalled: taking it off the list does not cancel
  it, and the screen says so.

## Behaviours

- Copy → clipboard, with a brief "Copied" toast
- Share → includes the link text, and the QR image when the toggle is on
- Regenerate → new token, link and QR update
- The screen can simply be shown to somebody for a direct scan
