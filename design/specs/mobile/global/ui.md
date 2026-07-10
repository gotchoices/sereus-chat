# UI Spec

## Decisions

- **Theme**: system (default) | light | dark
- **Icon set**: ionicons
- **UI kit**: none

## Tokens

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

### Colors (semantic tokens)

Theme is user-selectable (system | light | dark) and affects every token below.
Screens reference tokens by name only — never raw hex. `surfaceAlt` is the
card / incoming-bubble fill that sits one step off `background`; `accent` is
the brand color and the outgoing-message-bubble fill.

Light:
- background: #ffffff        surface: #ffffff        surfaceAlt: #f2f4f7
- textPrimary: #111111       textSecondary: #555555  textMuted: #888888
- border: #e2e2e2            divider: #eeeeee
- accent: #1a7f5a            accentText: #ffffff
- success: #2c8a3f (online)  danger: #c4392f          bannerError: #ffeeee
- overlay: rgba(0,0,0,0.4)

Dark:
- background: #000000        surface: #111111        surfaceAlt: #1c1f24
- textPrimary: #eeeeee       textSecondary: #bbbbbb  textMuted: #888888
- border: #2a2d31           divider: #222222
- accent: #37b283           accentText: #06231a
- success: #52c46b           danger: #ef5350          bannerError: #330000
- overlay: rgba(0,0,0,0.6)

Brand accent is green. The two accent values are the same hue tuned for
contrast against each theme's background (AA in both).

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

## Visual Conventions

Baseline look-and-feel. Intent, not pixels — screen specs describe layout and
behavior and lean on the shared components (see `components/index.md`) rather
than restating these.

- **Surfaces**: content sits on cards (radius 12, 1px `border`, `spacing[3]`
  padding) on a `background` page — not flat hairline-divided rows.
- **Lists**: card rows with a leading Avatar; comfortable density (row height
  ~56). Tapping a whole row is the primary action.
- **Avatars**: circular. With no image, show the initial on a fill color
  derived (hashed) from the display name — not a uniform gray.
- **Badges / pills**: fully rounded (radius 999); count, dot, or short label.
- **Empty states**: centered icon + title + one-line hint, plus a CTA where an
  action exists — never a bare sentence.
- **Message bubbles**: outgoing = `accent` / `accentText`; incoming =
  `surfaceAlt` / `textPrimary`; radius 16; max width ~80%.
- **Headers**: themed from tokens (background, tint, title) — not the framework
  defaults.
- **Accessibility** (project posture = Production): body/label text meets AA
  contrast in both themes; interactive targets ≥ 44×44.
