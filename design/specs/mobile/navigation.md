# Navigation Spec

Single-stack navigation (no tabs). Home is the strand list; everything else is pushed, presented, or
overlaid from it.

## Sitemap

```
StrandList  ← root
├── Profile (push)                    ← footer avatar
│   ├── Settings (push)
│   └── CadreManager (push)           ← shared component, src/cadre-ui/
├── SearchInterface (push)            ← header search
├── InvitationGenerator (modal)       ← header "New strand", or from StrandDetail
├── QrScanner (modal)                 ← footer scan
├── InvitationAcceptance (modal)      ← deep link only
└── ChatInterface (push)              ← tap a strand row
    ├── StrandDetail (push)           ← tap the header
    │   └── StrandMedia (push)
    ├── MediaPicker (sheet)           ← composer "+"
    ├── MediaViewer (full-screen)     ← tap an attachment
    ├── VoiceCallOverlay (overlay)    ← parked, story 90
    └── VideoCallActive (full-screen) ← parked, story 90
```

## Screen Roles

| Screen | Route | Entry | Transition |
|--------|-------|-------|------------|
| StrandList | StrandList | App launch | Root |
| ChatInterface | ChatInterface | Tap a strand row | Push |
| StrandDetail | StrandDetail | Chat header (title / member count) | Push |
| StrandMedia | StrandMedia | StrandDetail, or a search result | Push |
| MediaViewer | MediaViewer | Tap an attachment, in chat or StrandMedia | Full-screen |
| MediaPicker | MediaPicker | Composer "+" | Sheet |
| SearchInterface | SearchInterface | Home header, or chat header for in-strand | Push |
| InvitationGenerator | InvitationGenerator | Home header, or StrandDetail "add someone" | Modal |
| InvitationAcceptance | InvitationAcceptance | Deep link or scan | Modal over Home |
| QrScanner | QrScanner | Home footer | Modal |
| Profile | Profile | Home footer avatar | Push |
| Settings | Settings | Profile row | Push |
| CadreManager | CadreManager | Profile "My machines" row | Push |
| VideoCallActive | VideoCallActive | Chat header camera — parked | Full-screen |
| VoiceCallOverlay | VoiceCallOverlay | Chat header phone — parked | Overlay |

## First run

```
First launch
└── Name prompt (modal over StrandList; name only, no account)
    └── StrandList, empty and explaining itself → InvitationGenerator
```

Story 01: the empty StrandList is where "strand" is introduced, attached to something the user is
looking at. The most prominent action is starting one. A returning user with still no strands is not
nagged.

## Deep links

- Scheme: `sereus://`
- Invitation: `sereus://invite/{token}` → InvitationAcceptance
- Strand: `sereus://strand/{id}` → ChatInterface
- Mock variants (mock builds only): `sereus://screen/{Route}?variant={happy|empty|error}`

An invitation link opened without the app installed lands on a web page; after installing, the user
scans or opens the link again (story 03 — deliberate, no third-party deferred-link service).

## Transitions

| Type | Animation | Back behaviour |
|------|-----------|----------------|
| Push | Slide from right | Pop |
| Modal | Slide up | Dismiss |
| Sheet | Slide up, partial height | Tap outside to dismiss |
| Full-screen | Fade | Explicit close |
| Overlay | Fade, floating | Tap outside to dismiss |

## Route titles

- StrandList: "Strands"
- ChatInterface: strand title (dynamic) with member count beneath for groups
- StrandDetail: strand title (dynamic)
- StrandMedia: "Shared here"
- SearchInterface: "Search"
- InvitationGenerator: "New strand" or "Add someone" depending on entry
- Profile: "Profile" · Settings: "Settings" · CadreManager: "My machines"
