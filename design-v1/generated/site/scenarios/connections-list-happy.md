# Scenarios: Home – With Strands

Based on: `design/stories/managing-connections.md`

Persona: Alex (returning user)  
Preconditions: locale=en, variant=happy (sample hebras present)

## Scenario 1: View existing strands
- Intent: See recent conversations and pick one to open
- Deep link: `chat://connections?variant=happy&locale=en&scenario=home-happy-1`
- Narrative:
  - Alex sees a list of existing hebras, sorted by recent activity.
  - He spots Susan’s strand and intends to open it.
- [![connections-list-happy](../images/connections-list-happy.png)](chat://connections?variant=happy&locale=en&scenario=home-happy-1)

## Alternates and Errors
- Alternate (search entry): Use `chat://search?locale=en&scenario=home-search` to discover via search instead of the list.

Notes:
- Tapping an item should navigate to ChatInterface with the appropriate `strandId`.
# Scenario: ConnectionsList — happy (EN)

Deep link:

`chat://connections?variant=happy&locale=en`

Screenshot:

`design/generated/images/connections-list-happy.png` (to be captured)

Notes:
- Renders sample strands; tapping one navigates to ChatInterface.


