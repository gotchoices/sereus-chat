# Media Picker

Toast-style overlay to choose attachment source. Appears over chat when user taps +.

## Layout

Four large buttons: Camera, Gallery, File, Location

## Behaviors

- Tap option → invokes native picker (camera, photo library, file browser, or location)
- After selection → returns to chat with provisional attachment chip
- Tap outside or close → dismisses without action
- Permission denied → inline notice, picker stays open

## States

- **Normal**: Four options visible
- **Permission error**: Inline message below affected option
