---
id: scenario-chat-interface-empty
screen: ChatInterface
deeplink: chat://chat/t-susan?variant=empty
dependsOn:
  - design/specs/screens/chat-interface.md
  - design/specs/navigation.md
  - src/screens/ChatInterface.tsx
  - mock/data/Messages/empty.json
---

# Scenarios: Chat – Empty Strand

Based on: `design/stories/responding.md`

Persona: Alice (new participant)  
Preconditions: locale=en, variant=empty, strandId=t-susan

## Scenario 1: Empty conversation setup
- Intent: Validate empty-state and initial compose experience
- Deep link: `chat://chat/t-susan?variant=empty&locale=en&scenario=chat-empty-1`
- Narrative:
  - Alice opens a newly created strand with Susan and sees that there are no messages yet.
  - The empty-state copy encourages her to say hello.
- Screenshot: `design/generated/images/chat-interface-empty.png`


