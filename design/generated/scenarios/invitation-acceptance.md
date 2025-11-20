# Scenarios: Invite – Acceptance (Friend)

Based on: `design/stories/discovery.md`

Persona: Maria (invitee)  
Preconditions: locale=en, variant=happy, invite token is valid

## Scenario 1: Open invite link and accept
- Intent: Accept Alex’s invitation to create a new strand together
- Deep link: `chat://invite/demo-1234?variant=happy&locale=en&scenario=accept-1`
- Narrative:
  - Maria taps the link Alex shared and lands on the acceptance screen.
  - She reviews the token and taps Join to proceed; a new strand will be created.
- Screenshot: `design/generated/images/invitation-acceptance.png`

## Alternates and Errors
- Error (expired token): Use a non-existent token to surface an error message (future).

Notes:
- In mock mode, Join returns to Home; in production, the engine would validate and create the strand.
# Scenario: InvitationAcceptance (EN)

Deep link:

`chat://invite/demo-1234?variant=happy&locale=en`

Screenshot:

`design/generated/images/invitation-acceptance.png` (to be captured)

Notes:
- Token shown; Join and Cancel buttons visible.


