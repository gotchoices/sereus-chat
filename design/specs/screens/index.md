# Screens Plan (Human Proposal)

Purpose
- Make a first pass at screen names and routes before generation.
- If you leave this as-is, the agent will propose names from stories.

Instructions
- List each screen with a clear, stable name and short purpose.
- Add a proposed route (used for deep links and navigation).
- Optional: note variants to support early (happy, empty, error).

Template

| Screen Name        | Route            | Purpose                                 | Variants                |
|--------------------|------------------|-----------------------------------------|-------------------------|
| ConnectionsList    | ConnectionsList  | Home list of connections/strands        | happy, empty, error     |
| ChatInterface      | ChatInterface    | Strand conversation view                | happy, empty, error     |
| ProfileSetup       | ProfileSetup     | Setup/edit profile                      | happy, error            |
| MediaPicker        | MediaPicker      | Select or capture media                 | happy, empty, error     |
| SearchInterface    | SearchInterface  | Global search across people/messages    | happy, empty, error     |
| InvitationGenerator| InvitationGenerator | Create/share invite link/QR          | happy, error            |
| QrScanner          | QrScanner        | Scan invitation QR                      | happy, error            |
| MessageEditMode    | MessageEditMode  | Edit/delete an existing message         | happy, error            |
| VideoCallActive    | VideoCallActive  | Full-screen video call UI               | happy, error            |
| VoiceCallOverlay   | VoiceCallOverlay | Floating voice call controls            | happy, error            |
| InvitationAcceptance | InvitationAcceptance | Accept invite via deep link        | happy, error            |

Notes
- Add/remove rows as needed. You can refine names later, but avoiding churn helps.
- Screen-specific requirements go in `design/specs/screens/<screen-id>.md`.


