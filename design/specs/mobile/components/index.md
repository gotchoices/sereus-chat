# Components Plan

List reusable UI components for this target.

## Instructions

- Components are shared building blocks used by multiple screens/routes
- Keep component specs **user-observable** (behavior, states, constraints)
- Implementation mapping belongs in consolidations (`design/generated/...`)

## Components

Shared presentational building blocks. These carry the app's look so screens
stay about intent, not styling. All draw from the tokens and conventions in
`global/ui.md`. Specs stay user-observable (behavior + states); a component
earns its own file only when its states need more than the one-line summary
here.

| Component     | Spec File | Used By                                       | Status |
|---------------|-----------|-----------------------------------------------|--------|
| Avatar        | —         | ConnectionsList, ChatInterface, ProfileSetup  | draft |
| ListRow       | —         | ConnectionsList, SearchInterface              | draft |
| MessageBubble | —         | ChatInterface                                 | draft |
| Badge         | —         | ConnectionsList, CadreManager                 | draft |
| EmptyState    | —         | ConnectionsList, SearchInterface, Alerts      | draft |
| Banner        | —         | all screens                                   | draft |
| IconButton    | —         | headers, footers, ConnectionsList             | draft |
| SectionHeader | —         | CadreManager, ProfileSetup                    | draft |

### Behavior & states

- **Avatar** — circular; image when available, else the display-name initial on
  a fill color hashed from the name. Sizes: sm (list) / md (header, profile).
- **ListRow** — card surface; leading Avatar, title + one-line subtitle
  (truncated), optional trailing slot (Badge / timestamp / chevron). Whole row
  is tappable; pressed feedback.
- **MessageBubble** — outgoing (`accent`) vs incoming (`surfaceAlt`); optional
  sender name (group), delivery status tick, and attachment preview; max width
  ~80%.
- **Badge** — pill (radius 999). Modes: count (caps at 99), status dot, or short
  text label; color by semantic token (danger for unread, success for online).
- **EmptyState** — centered icon + title + one-line hint + optional CTA button.
- **Banner** — inline; error vs info variant; optional retry / dismiss action.
- **IconButton** — icon-only affordance; ≥44×44 hit area; pressed and disabled
  states.
- **SectionHeader** — uppercase/muted label + optional trailing add action.

## Notes

- Add/remove rows as needed
- Component spec filenames use kebab-case
- The CadreManager component (`src/cadre-ui/`) is provided separately and brings
  its own themed styling; these components are for the chat screens.


