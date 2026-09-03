---
provides: ["screen:mobile:MediaViewer"]
needs: ["domain:Entity:Attachment"]
dependsOn:
  - design/specs/mobile/screens/media-viewer.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/overview.md
  - design/stories/mobile/21-receiving-media.md
---

# Consolidation: MediaViewer

> The human spec (`specs/mobile/screens/media-viewer.md`) **is silent** on this screen: everything
> below is generation's inference from the stories, and may be overridden there at any
> time.

## Purpose

Full-screen presentation of one attachment, with the surrounding set swipeable.

## Route

- `MediaViewer` — full-screen presentation from ChatInterface or StrandMedia
- Params: `{ strandId, attachmentId, setFilter? }`
- Mock: `sereus://screen/MediaViewer?variant={happy|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | `locality === 'local'` | happy |
| fetching | `locality === 'fetching'` | happy (second item) |
| unreachable | `locality === 'unreachable'` | happy (third item) |
| unsupported | No handler for `mimeType` | — |
| error | Item cannot be read | error |

Three of these come from one `locality` field; they are not separate fetches.

## Swipe set

The set is whatever the caller was showing — the strand's media under the active filter — passed in
rather than re-queried, so what the user swipes matches what they were looking at. Never silently
widen it.

## Presentation

- **Dark ground, deliberately not a theme token** (`#0b0d0e`): the image is the subject, and a
  near-white page competes with it in either theme.
- Chrome is therefore explicitly light (`#e8eaec`) — theme-coloured icons render dark-on-dark and
  vanish. Pass `color` to every `IconButton` on this screen.

## Implementation Notes

- **`renderItem` must render the item it is handed**, not the screen's `current` state. Rendering
  `current` for every page makes the pager show one attachment on all pages until the scroll
  settles — this was a live bug found on device.

- Chrome auto-hides on tap; always restore it before showing any message state, or the user is left
  with a bare screen and no way out.
- Zoom/pan via `react-native-gesture-handler` + `reanimated`; double-tap toggles fit/fill.
- Video and voice share one transport component; the durations come from `durationMs`.
- Overflow: save to device (OS library), share out (OS sheet), remove local copy, go to message.
  "Go to message" pops back to ChatInterface anchored on `messageId`.
- **Saving and sharing leave the app's reach.** The copy says so once; nothing tracks what follows.
- `unsupported`: hand off via the OS open-with; if nothing handles it, say so plainly rather than
  rendering an empty frame.

## Libraries

- `react-native-gesture-handler`, `react-native-reanimated`
- `@react-native-camera-roll/camera-roll` for saving
- `Share` from react-native for sharing out
