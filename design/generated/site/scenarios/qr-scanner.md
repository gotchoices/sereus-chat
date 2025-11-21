# Scenarios: QR Scanner

Based on: `design/stories/discovery.md`

Persona: Alex (inviter)  
Preconditions: locale=en

## Scenario 1: Paste invite on simulator
- Intent: Validate that the simulator path allows testing acceptance
- Deep link: `chat://scan?locale=en&scenario=qr-1`
- Narrative:
  - On simulator, Alex sees the paste field (no live camera).
  - He pastes an invite URL to simulate scanning and proceeds.
- [![qr-scanner](../images/qr-scanner.png)](chat://scan?locale=en&scenario=qr-1)

## Alternates
- Device with camera: Use the same deep link on a device to see the live camera overlay.

Notes:
- The scanner should parse the invite link and hand off to the acceptance flow.
# Scenario: QrScanner (EN)

Deep link:

`chat://scan?locale=en`

Screenshot:

`design/generated/images/qr-scanner.png` (to be captured)

Notes:
- Simulator shows paste field; device shows live camera with overlay.


