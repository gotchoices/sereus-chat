# Screens

Derived from `design/stories/mobile/` (19 stories). Routes are PascalCase; spec files kebab-case.

| Screen | Route | Purpose | Variants |
|--------|-------|---------|----------|
| StrandList | StrandList | Home. Every strand the user belongs to; unread triage, pending invitations, archived | happy, empty, error |
| ChatInterface | ChatInterface | One strand's conversation: reading, writing, replying, reacting | happy, empty, error |
| StrandDetail | StrandDetail | Who is in a strand, what it is, and what the user can do about it | happy, empty, error |
| StrandMedia | StrandMedia | Everything shared in one strand, in one place | happy, empty, error |
| MediaViewer | MediaViewer | Full-screen attachment: view, zoom, move between, keep | happy, error |
| MediaPicker | MediaPicker | Choose where an attachment comes from | happy, error |
| SearchInterface | SearchInterface | Progressive search across or within strands | happy, empty, error |
| InvitationGenerator | InvitationGenerator | Make and share an invitation; see outstanding ones | happy, empty, error |
| InvitationAcceptance | InvitationAcceptance | See an invitation's terms and accept or decline | happy, error |
| QrScanner | QrScanner | Scan an invitation | happy, error |
| Profile | Profile | What others see of me, and the way in to settings and machines | happy, error |
| Settings | Settings | Appearance, language, notifications, storage | happy, error |
| CadreManager | CadreManager | The user's own machines (shared component, `src/cadre-ui/`) | n/a |
| VideoCallActive | VideoCallActive | Full-screen video call — **parked**, story 90 | happy, error |
| VoiceCallOverlay | VoiceCallOverlay | Voice call controls — **parked**, story 90 | happy, error |

## Changes from the previous map

- **ConnectionsList → StrandList.** A row is a strand, not a person: it may be a group, its title may
  not be anybody's name, and its preview needs a sender. Driven by stories 30 and 31.
- **ProfileSetup → Profile.** It is not a setup step; it is where identity is managed continuously
  (story 40), and the way through to Settings and CadreManager.
- **StrandDetail, StrandMedia, MediaViewer, Settings** are new, from stories 31/33, 21, 21, 41.
- **Alerts removed.** It was coded and routed with no story, spec or index entry. The strand list is
  the inbox (story 10); a second notification surface would compete with it.
- **ForwardTo never built.** Forwarding was drafted and dropped; see `design/stories/mobile/index.md`.
