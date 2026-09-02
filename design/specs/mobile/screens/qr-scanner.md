---
id: qr-scanner
route: QrScanner
variants: [happy, error]
description: Scan an invitation somebody is showing you.
---

# Scanner

Story 03.

## Purpose

The in-person path: somebody holds up their phone, and this reads it.

## Behaviours

- Camera fills the screen with a clear target area and one line of instruction
- On reading a valid invitation → InvitationAcceptance
- Anything else scanned is reported as not an invitation, and scanning continues
- A torch control where the device has one

## States

- **happy**: scanning
- **permission**: camera refused — explains what it is for and offers the settings route
- **unrecognised**: something scanned that is not one of ours; keeps scanning
- **error**: the camera is unavailable

## Acceptance

- [ ] A valid invitation goes straight to acceptance with no intermediate confirmation
- [ ] An unrecognised code does not end the session
- [ ] Refused permission explains the purpose rather than only reporting the refusal
