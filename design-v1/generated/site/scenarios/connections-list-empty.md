# Scenarios: Home – Empty State

Based on: `design/stories/discovery.md`

Persona: Alex (new user)  
Preconditions: locale=en, variant=empty (no strands)

## Scenario 1: First open shows empty state
- Intent: Validate empty home experience and prompt to invite
- Deep link: `chat://connections?variant=empty&locale=en&scenario=home-empty-1`
- Narrative:
  - Alex opens the app for the first time and sees that there are no hebras yet.
  - The empty-state text suggests inviting a friend to get started.
- [![connections-list-empty](../images/connections-list-empty.png)](chat://connections?variant=empty&locale=en&scenario=home-empty-1)

## Alternates and Errors
- Alternate (locale=es): Use `chat://connections?variant=empty&locale=es&scenario=home-empty-1` to verify localized copy and layout.

Notes:
- Invite entrypoint should be reachable from header or overflow.
# Scenario: ConnectionsList — empty state (EN)

Deep link:

`chat://connections?variant=empty&locale=en`

Screenshot:

`design/generated/images/connections-list-empty.png` (to be captured)

Notes:
- Shows empty-state text; Invite button accessible from header/menu.


