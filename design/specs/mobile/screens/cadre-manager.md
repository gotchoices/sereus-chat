---
id: cadre-manager
route: CadreManager
variants: []
description: The user's own machines — a shared component, not designed here.
---

# Cadre Manager

Story 42. **Not chat's screen to design.** Its contract is `apps/mobile/src/cadre-ui/SPEC.md`,
intended for extraction as a shared sereus package; health's *Sereus Connections* is the
furthest-along sibling.

Chat owns the route, its entry from Profile, and the theme passed in.

## Constraints

- Oriented to cadre management only. **Do not put strand invitations, members or guests on it** —
  chat has its own invitation flow
- Do not re-specify the component's layout here
