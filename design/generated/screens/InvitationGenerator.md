---
provides: ["screen:InvitationGenerator"]
needs: []
dependsOn:
  - design/specs/screens/invitation-generator.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
usedBy:
  - "route:InvitationGenerator"
---

# Consolidation: InvitationGenerator

Purpose
- Generate and share an invitation link (deep link) that on acceptance joins a strand or establishes connection.

Layout/Behavior
- Show generated invite link; allow copy/share (use native Share for now)
- Include variant in link during mock/demo


