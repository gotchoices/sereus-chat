---
id: scenario-chat-interface-happy
screen: ChatInterface
deeplink: chat://chat/t-susan?variant=happy
dependsOn:
  - design/specs/screens/chat-interface.md
  - design/specs/navigation.md
  - src/screens/ChatInterface.tsx
  - mock/data/Messages/happy.json
---

# Scenarios: Chat – Happy Path

Based on: `design/stories/responding.md`

Persona: Alice (active participant)  
Preconditions: locale=en, variant=happy, strandId=t-susan

## Scenario 1: Read and reply
- Intent: Read recent messages and send a short response
- Deep link: `chat://chat/t-susan?variant=happy&locale=en&scenario=chat-happy-1`
- Narrative:
  - Alice reviews the latest messages from Susan; contiguous bubbles group by sender.
  - She types a brief reply and taps Send; the message appears as an outgoing bubble.
- [![chat-interface-happy](../images/chat-interface-happy.png)](chat://chat/t-susan?variant=happy&locale=en&scenario=chat-happy-1)


