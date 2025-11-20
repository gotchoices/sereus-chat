---
provides: ["screen:MediaPicker"]
needs: []
dependsOn:
  - design/specs/screens/media-picker.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
usedBy:
  - "route:MediaPicker"
---

# Consolidation: MediaPicker

Purpose
- Toast-style chooser overlay to select attachment source (Camera, Gallery, File, Location).

Behaviors
- Dismiss on backdrop tap or close button
- Invoke native pickers via libraries; return provisional attachment payload to ChatInterface
- Handle permission errors inline; remain open

Layout
- Two rows of large buttons with icon+label; accessible role “button”
- Minimal dim on background; no full-screen sheet


