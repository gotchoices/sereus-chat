---
id: profile
route: Profile
variants: [happy, error]
description: What other people see of me.
---

# Profile

Story 40.

## Layout

- **Header**: back, "Profile", Save
- **Avatar**: large, with an edit pencil → media picker
- **Fields**: Name (required), Email, Phone, Notes/Bio
- **Privacy notice**: inline text about what is shared with peers
- **Rows**: Settings, My machines

## Behaviours

- Save → validates that a name is present, persists, returns
- Back with unsaved changes → confirm discard
- No avatar → initials
- Empty name on save → highlight the name field
