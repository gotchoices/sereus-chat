---
provides: ["screen:mobile:MediaPicker"]
needs: ["domain:Entity:Attachment"]
dependsOn:
  - design/specs/mobile/screens/media-picker.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/stories/mobile/20-sending-media.md
  - design/stories/mobile/40-my-profile.md
---

# Consolidation: MediaPicker

## Purpose

Sheet over the conversation choosing an attachment source. Also serves Profile's avatar change.

## Route

- `MediaPicker` — sheet from the composer "+", or from Profile
- Params: `{ purpose: 'attachment'|'avatar' }`
- Mock: `sereus://screen/MediaPicker?variant={happy|error}`

## Options

Camera · Library · Files. **Location is not offered** and no story calls for it. Voice is the
composer's microphone, not a picker option.

## Implementation Notes

- Multi-select for `attachment`, single for `avatar`.
- Selections return as staged chips above the composer; removable; nothing leaves the device until
  the message is sent (story 11 — an unsent draft never leaves the phone).
- Per-option permission handling: inline message beneath the refused option, sheet stays open, other
  options still work.
- Oversized files are checked against the **user's own ceiling** from Settings, not a constant, and
  offer downscaling or a different file rather than refusal.
- `avatar` purpose routes through a crop step before returning.

## Libraries

- `react-native-image-picker`, `@react-native-documents/picker`
