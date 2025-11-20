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

# Scenario: Chat – Empty Strand

Persona: Alice viewing a new strand with no messages yet.

Steps
1. Open the new strand from Home.
2. Observe the empty-state hint.
3. Use the composer to start the conversation (optional).

Preview

![Chat (empty)](../images/chat-susan-empty.png)

[Open in App](chat://chat/t-susan?variant=empty)


