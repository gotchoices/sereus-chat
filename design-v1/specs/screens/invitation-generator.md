---
id: InvitationGenerator
route: InvitationGenerator
variants: [happy]
---

# Invitation Generator – Design Specifications

## Purpose
Let a user create and present an invitation that another person can use to join a Sereus strand/connection. The invitation is a deep link and may also be presented as a QR code. The inviter may simply show the screen (for on‑the‑spot scanning), copy the link, or share via the native share sheet.

## Link Format
- Deep link: `sereus://invite/{token}`
- Optional parameters (mock/demo): `?variant=<name>`
- Token: short, URL‑safe, random string (engine will later supply signed/expiring tokens).

## Layout
- Title (native header): “Invite Friends”
- Body card:
  - “Invitation Link” label
  - Read‑only link text (selectable)
  - Copy icon button (tap → copy link to clipboard; show brief auto‑dismiss “Copied” toast; no confirmation dialog)
  - Toggle:
    - Include QR (default: on)
  - Live QR preview (visible only if Include QR is on; sized large enough to scan directly from the screen)
  - Share button (native Share) – icon-only; always includes the link; mention QR in message only if visible
  - Regenerate control (secondary) to mint a new token (mock/demo: random string)

## Behavior
- On load: generate a token and render link; QR visible if toggle is on
- Copy icon: copies the link to clipboard; does not dismiss
- Share:
  - Always include the deep link text
  - If Include QR → include QR as PNG (base64 attachment when supported) or add guidance text
- Showing to a friend: leaving the screen open with QR visible is a valid flow; ensure QR contrast and size are adequate for scanning
- Regenerate: creates a new token; updates both link and QR

## Accessibility
- QR has an accessible label describing it as an invitation QR
- Copy icon has an accessible label (“Copy link”)
- Share button has an accessible label (“Share invitation”)
- Toggles have labels and value announcements for screen readers

## Implementation Notes
- QR: use `react-native-qrcode-svg` (render preview; provide a `toDataURL` to produce PNG for share when Include QR is selected)
- Share: use platform `Share.share()`; where possible attach the QR PNG for email; otherwise include link text; use an icon button (platform-appropriate glyph)
- Clipboard: use `@react-native-clipboard/clipboard`
- Persist last toggle choices locally for convenience (optional)

## Validation
- Link is always shown and included in Share


