---
provides: ["screen:mobile:QrScanner"]
needs: []
dependsOn:
  - design/specs/mobile/screens/qr-scanner.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/stories/mobile/03-respond-to-an-invitation.md
---

# Consolidation: QrScanner

## Purpose

Read an invitation from somebody's screen.

## Route

- `QrScanner` — modal from the StrandList footer
- Mock: `sereus://screen/QrScanner?variant={happy|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Camera live, scanning | happy |
| permission | Camera access refused | — |
| unrecognised | A code that is not ours; transient toast, scanning continues | — |
| error | Camera unavailable | error |

## Implementation Notes

- Parse `sereus://invite/{token}`; on a match, navigate to InvitationAcceptance and **replace** this
  route so back does not return to a live camera.
- Unrecognised codes: brief inline toast, keep the session alive. Do not stack toasts on repeated
  reads of the same code — debounce by payload.
- Permission state explains the purpose before offering the settings route; a bare "permission
  denied" is not enough.
- Release the camera on blur, not only on unmount — a modal left in the stack must not hold it.

## Libraries

- `react-native-vision-camera` with its code scanner, or `expo-camera` equivalent
