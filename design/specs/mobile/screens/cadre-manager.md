---
id: cadre-manager
route: CadreManager
variants: []
description: The user's own machines — a shared component, not designed here.
---

# Cadre Manager

Story 42. **This screen is not chat's to design.**

## What chat owns

- The route, and its entry from Profile ("My machines")
- Passing the app's theme into the component
- Booting the cadre layer at startup so the screen has something to read

## What the component owns

Everything visible: network identity, keys, and the machines acting for the user. It lives at
`apps/mobile/src/cadre-ui/` with its own `SPEC.md`, and is intended for extraction as a shared
sereus package. Chat's copy deliberately excludes strand membership, because chat has its own
invitation flow; health's *Sereus Connections* puts guests on the same page instead, and is the
furthest-along sibling worth reading before changing anything here.

## What chat must not do

- Add strand invitations, members or guests to this screen
- Re-specify the component's layout in this repo's screen specs
- Assume the screen can load quickly: a solo node cannot reliably read its own control database, so
  the component time-boxes those reads. Chat must not wrap it in a blocking loader.

## Acceptance

- [ ] Reachable from Profile
- [ ] Themed with the app's tokens, with no chat-specific content added
- [ ] Never blocks on control-database reads
