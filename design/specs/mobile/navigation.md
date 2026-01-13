# Navigation Spec

Single-stack navigation (no tabs).

## Sitemap

```
HOME (ConnectionsList) ← Root
├── Profile (push)
├── Search (push)
├── Invite (modal)
├── QR Scanner (modal)
└── Strand (push)
    ├── Media Picker (toast/overlay)
    ├── Voice Call (overlay)
    └── Video Call (full-screen)
```

## Screen Roles

| Screen | Route | Entry | Transition |
|--------|-------|-------|------------|
| ConnectionsList | ConnectionsList | App launch | Root |
| ProfileSetup | ProfileSetup | Home footer avatar | Push |
| SearchInterface | SearchInterface | Home header search | Push |
| InvitationGenerator | InvitationGenerator | Home header "Add Friends" | Modal |
| QrScanner | QrScanner | Home footer QR icon | Modal |
| ChatInterface | ChatInterface | Tap strand row | Push |
| MediaPicker | MediaPicker | Chat "+" button | Toast/overlay |
| VoiceCallOverlay | VoiceCallOverlay | Chat phone icon | Overlay |
| VideoCallActive | VideoCallActive | Chat camera icon | Full-screen |
| InvitationAcceptance | InvitationAcceptance | Deep link | Modal over Home |

## Onboarding

```
First Launch
└── ProfileSetup (modal, name required)
    └── → Home (ConnectionsList)
```

## Deep Links

- Scheme: `sereus://`
- Invitation: `sereus://invite/{token}` → InvitationAcceptance modal
- Future: `sereus://strand/{id}` → ChatInterface

## Transition Types

| Type | Animation | Back Behavior |
|------|-----------|---------------|
| Push | Slide from right | Pop to previous |
| Modal | Slide up | Dismiss |
| Overlay/Toast | Fade in | Tap outside to dismiss |

## Route Options (titles)

- ConnectionsList: "Home"
- ProfileSetup: "Profile"
- SearchInterface: "Search"
- InvitationGenerator: "Invite Friends"
- ChatInterface: Partner name (dynamic)
- VideoCallActive: Partner name (dynamic)
