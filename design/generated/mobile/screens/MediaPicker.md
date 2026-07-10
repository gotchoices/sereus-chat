---
provides: ["screen:mobile:MediaPicker"]
needs: []
dependsOn:
  - design/specs/mobile/screens/media-picker.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/stories/mobile/sending-media.md
  - design/stories/mobile/profile-management.md
---

# Consolidation: MediaPicker

## Purpose

Toast-style chooser overlay to select attachment source (Camera, Gallery, File, Location).

## Route

- `MediaPicker` (toast/overlay from ChatInterface or ProfileSetup)

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Options visible | happy |
| permission_error | OS permission denied | error |

## Component Inventory

- Container: toast/sheet with minimal backdrop dim
- Container: themed bottom sheet (`surface`, rounded top, `overlay` backdrop) — shared conventions
- OptionRows (×4): `ListRow` — Camera, Gallery, File, Location (accent-tinted leading icon)
- CloseButton: `IconButton` in the sheet header
- ErrorNotice: `Banner` for permission/size errors

## Implementation Notes

- Camera/Gallery: `react-native-image-picker`
  - iOS: PHPicker (iOS 14+) or UIImagePickerController
  - Android: camera intent + media picker
- File: `@react-native-documents/picker` (use `pick`, `keepLocalCopy`)
- Permissions: `react-native-permissions`; handle denied/limited gracefully
- Location: optional; `react-native-geolocation-service` + map sheet if enabled

## Return Payload

```ts
type ProvisionalAttachment = {
  id: string;
  type: 'image' | 'video' | 'file' | 'location';
  uri?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  thumbnailUri?: string;
  location?: { lat: number; lon: number; label?: string };
};
```

## Platform Notes

- iOS: Prefer PHPicker; handle "Limited Photos" with inline notice
- Android: Use ACTION_OPEN_DOCUMENT with persistable URI permissions

