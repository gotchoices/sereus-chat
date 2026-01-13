# Invitation Generator

Create and share an invitation link/QR that others can use to connect.

## Layout

- **Link display**: Read-only deep link with copy icon
- **QR toggle**: Show/hide QR code (default: on)
- **QR preview**: Scannable QR when toggle is on
- **Share button**: Native share sheet
- **Regenerate**: Create new invitation token

## Behaviors

- Copy icon → copies link to clipboard, shows brief "Copied" toast
- Share → includes link text; includes QR image if toggle is on
- Regenerate → mints new token, updates link and QR
- User can simply show screen to friend for direct QR scan
