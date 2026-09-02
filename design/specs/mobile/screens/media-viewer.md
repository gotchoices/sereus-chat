---
id: media-viewer
route: MediaViewer
variants: [happy, error]
description: One attachment, full screen, with the rest of the set to hand.
---

# Media Viewer

Story 21.

## Purpose

Look at what somebody sent properly, move through the rest, and keep what is worth keeping.

## Layout

- Full screen, the image or video filling it, chrome fading out of the way
- **Top**: close, who sent it and when, overflow
- **Bottom** (video/voice): transport controls with elapsed and total

## Behaviours

- Swipe left/right through the current set — the strand's media, or whatever filter the user arrived
  under, so what they swipe matches what they saw
- Pinch to zoom and pan; double-tap toggles fit and fill
- Overflow: save to device, share out of the app, remove local copy, go to the message it came from
- Sharing out is the device's own sheet; the app makes no claim over what happens next
- A file that cannot be displayed is handed to whatever can open it, or plainly reported

## States

- **happy**: the item shows
- **fetching**: still coming — progress, and the rest of the set still swipeable
- **unreachable**: cannot be fetched right now, said plainly; not an error dialog
- **unsupported**: nothing on the device can display it; offer to open elsewhere
- **error**: it cannot be read at all

## Acceptance

- [ ] The swipe set matches the set the user came from
- [ ] Fetching, unreachable and unsupported are three different messages
- [ ] Saving puts a copy in the device's own library, beyond the app's reach
- [ ] Removing a local copy never implies reaching anyone else's
- [ ] The way back to the message it came from is always available
