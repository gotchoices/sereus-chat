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
| Avatar        | —         | StrandList, ChatInterface, StrandDetail, Profile | draft |
| ListRow       | —         | StrandList, SearchInterface, StrandDetail     | draft |
| MessageBubble | —         | ChatInterface                                 | draft |
| Badge         | —         | StrandList, CadreManager                      | draft |
| StrandStatus  | —         | StrandList, ChatInterface, StrandDetail, InvitationAcceptance | **new** |
| EmptyState    | —         | StrandList, SearchInterface, StrandMedia      | draft |
| Banner        | —         | all screens                                   | draft |
| IconButton    | —         | headers, footers, StrandList                  | draft |
| SectionHeader | —         | CadreManager, Profile, Settings, StrandDetail | draft |

### Behavior & states

- **Avatar** — circular; image when available, else the display-name initial on
  a fill color hashed from the name. Sizes: sm (list) / md (header, profile).
  Needs a **group form**: a composite of member avatars, or a single image where
  the strand has one. The name hash must accept a strand title, which may be no
  person's name.
- **StrandStatus** — says what a strand is, in a sentence rather than a bare
  badge: public, private and able to change, or private and settled. Derived
  only from recorded state — visibility and whether anyone can still add or
  remove — never from activity or how long somebody has been quiet. Appears
  wherever a member decides whether to say something: strand rows, the
  conversation header, and before accepting an invitation. Compact and full
  forms; the compact form still distinguishes all three.
- **ListRow** — card surface; leading Avatar, title + one-line subtitle
  (truncated), optional trailing slot (Badge / timestamp / chevron). Whole row
  is tappable; pressed feedback.
- **MessageBubble** — outgoing (`accent`) vs incoming (`surfaceAlt`); optional
  sender name (shown only in strands of more than two), reply quote, attachment
  preview, reaction strip and an edited marker; max width ~80%. **No delivery or
  read indicator** — none is tracked, and any existing status tick should be
  removed.
- **Badge** — pill (radius 999). Modes: count (caps at 99), mention marker, draft
  marker, muted glyph, status dot, or short text label; color by semantic token.
  A row shows at most one, in the precedence set by `screens/strand-list.md`.
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


