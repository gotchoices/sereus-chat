---
id: invitation-generator
route: InvitationGenerator
variants: [happy, empty, error, unreachable]
description: Make and share an invitation.
---

# Invitation Generator

Stories 02, 05.

## Layout

- **Link display**: read-only deep link with a copy icon
- **QR toggle**: show/hide the QR code, default on
- **QR preview**: scannable when the toggle is on
- **Share button**: native share sheet
- **Regenerate**: mint a new token

## Behaviours

- Copy → clipboard, with a brief "Copied" toast
- Share → includes the link text, and the QR image when the toggle is on
- Regenerate → new token, link and QR update
- The screen can simply be shown to somebody for a direct scan
