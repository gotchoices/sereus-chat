# Scenarios: Invite – Create and Share

Based on: `design/stories/discovery.md`

Persona: Alex (inviter)  
Preconditions: locale=en, variant=happy

## Scenario 1: Generate invite link
- Intent: Create a link/QR Alex can share with a friend
- Deep link: `chat://invite?variant=happy&locale=en&scenario=invite-1`
- Narrative:
  - Alex opens the Invite screen and sees a deep link token plus a toggle for QR.
  - He copies the link to the clipboard to share by text later.
- Screenshot: `design/generated/images/invitation-generator.png`

## Alternates and Errors
- Alternate (QR emphasis): Leave “Include QR” on to show a scannable code for in-person sharing.

Notes:
- The deep link should preserve `?variant` for demo data when in mock mode.
# Scenario: InvitationGenerator (EN)

Deep link:

`chat://invite?variant=happy&locale=en`

Screenshot:

`design/generated/images/invitation-generator.png` (to be captured)

Notes:
- Link displayed with copy; Include QR toggle on; Share button visible.


