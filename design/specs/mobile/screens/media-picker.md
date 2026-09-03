---
id: media-picker
route: MediaPicker
variants: [happy, error]
description: Choose where an attachment comes from.
---

# Media Picker

Story 20.

## Layout

Large buttons: Camera, Gallery, File.

## Behaviours

- Tap an option → the device's own picker
- After selection → back to the conversation with a provisional attachment chip
- Tap outside or close → dismiss with no action
- Permission denied → inline notice beneath that option; the picker stays open
