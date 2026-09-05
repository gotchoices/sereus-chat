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

Two mechanisms, chosen by where the link comes from.

**App Links — `https://sereus.org/chat/…`** for anything arriving from a web page or another app.
The OS opens the app when installed and loads the page when not, which is the behaviour a stranger
tapping a link needs. Browsers block or silently drop custom-scheme navigation, so this is the only
reliable route from the web.

| Path | Goes to |
|------|---------|
| `/chat/invite/{token}` | InvitationAcceptance |
| `/chat/relay?addr={multiaddr}` | Relay offer — **proposes**, never applies (story 42) |

**Custom scheme — `sereus://`** for QR codes, in-app links and local testing, where there is no
browser in the way. `chat://` remains as an alias.

| Link | Goes to |
|------|---------|
| `sereus://invite/{token}` | InvitationAcceptance |
| `sereus://strand/{id}` | ChatInterface |
| `sereus://relay?addr={multiaddr}` | Relay offer |
| `sereus://screen/{Route}?variant={…}` | Mock builds only |

### What App Links need

Verification happens **at install**, and the OS fetches the association file from the site **apex** —
`https://sereus.org/.well-known/`, never `/chat/.well-known/`. There is exactly one file per
platform for the whole host, shared by every sereus app:

- `assetlinks.json` — a JSON array, one entry per app, keyed by `target.package_name`
- `apple-app-site-association` — `applinks.details`, one entry per app, keyed by `appID`

Chat's copies live in `web/.well-known/` and are **merged** into the apex by `web/publish.sh`;
copying them wholesale would wipe the other apps' entries. Adding a path here means adding it to
both files and to the Android manifest, then reinstalling the app.

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
