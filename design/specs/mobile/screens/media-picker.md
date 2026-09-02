---
id: media-picker
route: MediaPicker
variants: [happy, error]
description: Choose where an attachment comes from.
---

# Media Picker

Story 20.

## Purpose

A small sheet over the conversation: where should this attachment come from.

## Options

Camera · Library · Files

Voice is **not** here — it is the composer's microphone, held to record (story 20). Location is not
offered: no story calls for it, and sharing a position has consequences this design has not worked
through.

## Behaviours

- Choosing an option hands off to the device's own picker
- Selections return as removable chips above the composer; several may be attached at once
- Nothing is sent until the user sends the message
- Refused permission is explained inline, per option, and the sheet stays open

## States

- **happy**: three options
- **permission**: inline message beneath the affected option

## Acceptance

- [ ] Attachments are staged and removable before sending
- [ ] A refused permission never closes the sheet or loses the other options
- [ ] Any size limit encountered is the user's own setting, not a fixed rule
