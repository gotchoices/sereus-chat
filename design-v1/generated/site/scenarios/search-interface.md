# Scenarios: Search

Based on: `design/stories/searching-messages.md`

Persona: Alex (returning user)  
Preconditions: locale=en

## Scenario 1: Search across strands
- Intent: Find an existing conversation by name
- Deep link: `chat://search?locale=en&scenario=search-1`
- Narrative:
  - Alex types “Susan” and sees the corresponding strand in results.
  - He taps the result to navigate to the conversation.
- [![search-interface](../images/search-interface.png)](chat://search?locale=en&scenario=search-1)

Notes:
- Results should include names and last preview; tapping opens ChatInterface.
# Scenario: SearchInterface (EN)

Deep link:

`chat://search?locale=en`

Screenshot:

`design/generated/images/search-interface.png` (to be captured)

Notes:
- Typing in the search field shows mock results over strands; tapping navigates to ChatInterface.


