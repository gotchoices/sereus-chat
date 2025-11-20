---
provides: ["screen:ProfileSetup"]
needs: []
dependsOn:
  - design/specs/screens/profile-setup.md
  - design/specs/navigation.md
  - design/specs/screens/index.md
  - design/specs/global/i18n.md
usedBy:
  - "route:ProfileSetup"
---

# Consolidation: ProfileSetup

Purpose
- Edit basic profile details (avatar, name, optional contact fields) with save in header.

Layout and Behaviors (from specs + stories)
- Header (navigator): Back (default), Title “Profile”, Save (right)
- Avatar section: large avatar with pencil (edit opens media picker placeholder)
- Fields: Name* (required), Email (optional), Phone (optional), Notes (optional, multiline)
- Privacy notice block below fields
- Save validates Name and returns on success
- Warn on back if there are unsaved changes (confirm discard)

States
- Empty avatar → initials
- Validation error on missing Name when saving


