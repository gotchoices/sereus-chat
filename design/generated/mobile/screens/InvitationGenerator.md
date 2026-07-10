---
provides: ["screen:mobile:InvitationGenerator"]
needs: []
dependsOn:
  - design/specs/mobile/screens/invitation-generator.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
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

Shared component layer (`src/components/`); theme tokens throughout.

- LinkDisplay: themed card row with the link `Text` + copy `IconButton`
- QRToggle: Switch (accent track) to show/hide QR
- QRPreview: large scannable QR — kept on white (`#fff`/`#000`) for scannability; only the surrounding box is themed
- ShareButton: accent `IconButton` → native Share.share()
- RegenerateButton: secondary themed button to mint a new token
- Error: `Banner` (error variant) + retry, when minting fails (e.g. no dialable address yet)

## Implementation Notes

- Link format: `chat://invite/{token}` (matches navigator linking prefixes)
- Mock/demo: append `?variant=<name>` for testing
- QR: `react-native-qrcode-svg` with `toDataURL` for share attachment
- Copy: `@react-native-clipboard/clipboard`
- Share: include link text always; include QR PNG if toggle is on
- Toast: brief "Copied" auto-dismiss (1200ms per ui.md)

