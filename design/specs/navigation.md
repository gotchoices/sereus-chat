# Navigation Sitemap

*Single-stack navigation (no tabs)*

## Primary Navigation Structure

```
HOME (Strands List) ← Root
├── Profile (push)
├── Search (push)
├── Invite (modal)
├── QR Scanner (modal)
└── Strand (push)
    ├── Media Picker (modal/overlay)
    ├── Message Edit (modal)
    ├── Voice Call (overlay / floating controls)
    └── Video Call (full-screen)
```

### Home: Strands List (ConnectionsList)
- Entry point after onboarding
- Shows existing strands; primary actions: Invite, Search, Profile
- Selecting a strand → push to Strand

### Profile (ProfileSetup for now)
- Manage name, contact info, profile picture
- Can be re-used from onboarding, or split later into a dedicated `profile.xml`

### Search (SearchInterface)
- Global search across People, Messages, Media
- Back returns to Home

### Invite (InvitationGenerator)
- Shows deep link and QR code
- Copy link, share options (OS share sheet handled by OS)

### QR Scanner (QrScanner)
- Scan an invitation QR to initiate/respond to connection flow

### Strand (ChatInterface)
- Chronological message list; tail view by default
- Message entry area: text input, + (attachments), microphone (voice)
- Call icons for voice and video
- From here:
  - Media Picker (MediaPicker) modal/overlay
  - Message Edit (MessageEditMode) modal
  - Voice Call (overlay) – floating controls (mute, hang up)
  - Video Call (VideoCallActive) full-screen

## Onboarding Flow
```
ONBOARDING
├── Profile Setup (profile-setup.xml) ← Entry Point (modal)
└── → Redirect to Home (Strands List)
```

## Deep Links
- `sereus://invite/{token}` → Invitation Acceptance (InvitationAcceptance) as modal over Home
- Future: `sereus://strand/{id}` → Strand (push)

## Screen Transition Types

| Transition | Usage | Animation | Back Behavior |
|------------|-------|-----------|---------------|
| **Push** | Navigate deeper from Home | Slide from right | Pop to previous screen |
| **Modal** | Focused task | Slide up from bottom | Dismiss to return |
| **Overlay** | Floating controls/pickers | Fade in | Tap outside to dismiss |

## Current Implementation Status

### ✅ Completed Screens (mapped)
- Home: `connections-list.xml`
- Strand: `chat-interface.xml`
- Profile / Onboarding: `profile-setup.xml`
- Invite: `invitation-generator.xml`
- Invitation Acceptance (deep link): `invitation-acceptance.xml`
- Media Picker: `media-picker.xml`
- Message Edit: `message-edit-mode.xml`
- Video Call: `video-call-active.xml`
- QR Scanner: `qr-scanner.xml`
- Search: `search-interface.xml`

### 🔄 Considerations / Future
- Separate `profile.xml` for ongoing profile edits (distinct from onboarding layout)
- Voice Call overlay UI specifics (size/position/controls)
- Search scoping toggles (People / Messages / Media filtering)

---

This sitemap is the source of truth for structure and transitions. Update this document whenever adding or modifying screens.

