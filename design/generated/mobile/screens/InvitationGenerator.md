---
provides: ["screen:mobile:InvitationGenerator"]
needs: []
dependsOn:
  - design/specs/mobile/screens/invitation-generator.md
  - design/specs/mobile/navigation.md
  - design/stories/mobile/discovery.md
---

# Consolidation: InvitationGenerator

## Purpose

Generate and share an invitation deep link/QR that on acceptance establishes a strand connection.

## Route

- `InvitationGenerator` (modal from Home)

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Token generated | happy |
| error | Generation failure | error |

## Data Requirements

- Token generation (mock: random URL-safe string; production: signed/expiring token from Sereus)

## Component Inventory

- Header: "Invite Friends" title
- LinkDisplay: read-only TextInput with link text
- CopyButton: icon button → clipboard + toast
- QRToggle: switch to show/hide QR
- QRPreview: large scannable QR (visible if toggle on)
- ShareButton: icon button → native Share.share()
- RegenerateButton: secondary action to mint new token

## Implementation Notes

- Link format: `sereus://invite/{token}`
- Mock/demo: append `?variant=<name>` for testing
- QR: `react-native-qrcode-svg` with `toDataURL` for share attachment
- Copy: `@react-native-clipboard/clipboard`
- Share: include link text always; include QR PNG if toggle is on
- Toast: brief "Copied" auto-dismiss (1200ms per ui.md)

