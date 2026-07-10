---
provides: ["screen:mobile:ProfileSetup"]
needs: ["domain:Entity:Profile"]
dependsOn:
  - design/specs/mobile/screens/profile-setup.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/stories/mobile/discovery.md
  - design/stories/mobile/profile-management.md
---

# Consolidation: ProfileSetup

## Purpose

Edit basic profile details (avatar, name, optional contact fields) with save in header.

## Route

- `ProfileSetup` (push from Home footer, or modal during onboarding)

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Profile loaded | happy |
| empty_avatar | No picture set | — |
| validation_error | Name missing on save | error |

## Data Requirements

- Profile: `{ name, email?, phone?, notes?, avatarUri? }`
- Local storage (device/cadre) per domain overview

## Component Inventory

Shared component layer (`src/components/`); theme tokens throughout.  Header
Save button is supplied via the navigator options.

- AvatarSection: `Avatar size="lg"` (name-hashed initial) with a pencil overlay → opens MediaPicker
- FieldList: themed TextInputs grouped in a card — Name*, Email, Phone; multiline Notes
- ManageDevices: `ListRow` → CadreManager
- PrivacyNotice: muted footnote (`textMuted`)
- DiscardDialog: confirm on back with unsaved changes

## Implementation Notes

- Name is required (asterisk label); others optional
- Avatar fallback: initials from name
- Save: validate name present → persist → navigate back
- Back with dirty state: show discard confirmation
- Avatar edit: invoke MediaPicker (camera/gallery/files), update preview on selection
- Privacy notice text: "Personal information is not collected or stored by Sereus. But information you enter may be shared with connected peers."

