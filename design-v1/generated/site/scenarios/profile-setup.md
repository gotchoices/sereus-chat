---
id: scenario-profile-setup-happy
screen: ProfileSetup
deeplink: chat://profile
dependsOn:
  - design/specs/screens/profile-setup.md
  - design/specs/navigation.md
  - src/screens/ProfileSetup.tsx
---

# Scenarios: Profile – Setup/Edit

Based on: `design/stories/profile-management.md`

Persona: Taylor (returning user)  
Preconditions: locale=en, mock mode (read-only persist)

## Scenario 1: Update basic info
- Intent: Review and update profile information
- Deep link: `chat://profile?locale=en&scenario=profile-1`
- Narrative:
  - Taylor opens Profile and reviews the current Name, Email, Phone, and Notes.
  - They edit the Name and adjust Notes.
- [![profile-setup](../images/profile-setup.png)](chat://profile?locale=en&scenario=profile-1)

## Alternates
- Avatar change triggers the MediaPicker overlay; for now, this is a placeholder.


