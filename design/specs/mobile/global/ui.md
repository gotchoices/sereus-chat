# UI Spec

## Decisions

- **Theme**: system (default) | light | dark
- **Icon set**: ionicons
- **UI kit**: none

## Tokens

- **Color tokens**: <semantic names, not raw palette dumps>
- **Spacing scale**: [4, 8, 12, 16, 20, 24]
- **typography**:
  title:
    size: 20
    weight: 600
  body:
    size: 16
    weight: 400
  small:
    size: 12
    weight: 400

- notifications:
  toast:
    enabled: true
    durationMs: 1200
    blocking: false
    android: ToastAndroid     # Prefer native toast
    ios: overlay              # Lightweight in-app overlay

## Icon Conventions

Prefer icons alone where sufficient:

| Icon | Action |
|------|--------|
| Copy | Copy to clipboard |
| Chat bubble | Draft new message |
| + (by input) | Attach |
| Microphone | Record voice |
| Phone | Voice call |
| Video camera | Video call |
| Magnifying glass | Search |

Use text (or icon + text) when meaning isn't obvious. Use full messages for security warnings.
