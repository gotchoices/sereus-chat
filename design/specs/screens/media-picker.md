---
id: MediaPicker
route: MediaPicker
variants: [happy, empty, error]
---

# Media Picker Design Specifications

*Human-authored design requirements for the MediaPicker route*

## Purpose

Lightweight, toast-style chooser that appears over `chat-interface` when the user taps the “+” button. It lets the user choose what to attach; the OS/library handles the actual selection. After selection, the attachment appears provisionally in the `chat-interface` composer (not sent yet).

## Layout Requirements

### Toast Chooser
- Non-fullscreen overlay anchored near the composer; dim the background minimally.
- Show four primary options as large, accessible touch targets:
  - Camera
  - Gallery
  - File
  - Location
- Include a close affordance (tap outside or an “x” icon) to dismiss.
- Keep labels short and clear; include icons for recognition.

## Interaction Requirements

### Option Selection
- Tap Camera → invoke native camera capture flow (OS/library).
- Tap Gallery → invoke native photo library selection flow.
- Tap File → invoke native file/document picker.
- Tap Location → invoke native or library map chooser (if enabled), otherwise show a brief “Not available” message.

### Post-Selection Behavior
- On successful selection, dismiss the toast and return to `chat-interface` with a provisional attachment in the composer area.
- No caption flow in the picker; user can type in the chat composer.

### State Changes
- Permission denied → show an inline notice/toast; keep the chooser open.
- Unsupported type/size → show inline notice and remain in chooser.
- Dismissal (tap outside or close icon) → close without side effects.

## Data Requirements

### What to Display
- Static list of options; availability can be gated by feature flags/capabilities.
- Option labels and icons only; no dynamic content from the thread.

### Real-time Updates
- None; the picker is stateless aside from availability flags.

## Visual Hierarchy

1. Primary: Four option buttons (Camera, Gallery, File, Location)
2. Secondary: Close affordance
3. Supporting: Subtext for permission errors (if shown)

## Navigation Context

- Position: Modal/toast over ChatInterface
- Back behavior: Dismiss toast on back; do not leave the chat
- Deep link: N/A

## Component Hints
- Use a toast/sheet-style container with backdrop
- Render option items with icon + label; accessible role “button”
- Provide an inline notice area for permission/errors

## Edge Cases

### Permissions Denied
- Condition: User hasn’t granted camera/storage/location permissions.
- Handling: Show brief inline message and remain on the chooser; provide retry on next tap.
- User Action: May cancel or pick a different source.

### Unsupported File/Too Large
- Condition: Selection returns type/size outside policy.
- Handling: Show inline error; allow retry.

## Accessibility Considerations

- Each option has accessible label and role “button”.
- Minimum touch target 44×44 pt/dp.
- Announce opening and closing of the toast.

## Performance Requirements

- Toast opens instantly (<150ms).
- No heavy operations; OS/library selection is deferred until an option is tapped.

## Notes

- Feature flags/capabilities determine which options are visible (e.g., web may hide Camera/Location).
- OS/library pickers manage the heavy UI; we only launch them.
- After selection, the `chat-interface` will handle provisional attachments, send icon visibility, and removal.

---

