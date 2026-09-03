---
provides: ["screen:mobile:CadreManager"]
needs: []
dependsOn:
  - design/specs/mobile/screens/cadre-manager.md
  - design/specs/mobile/navigation.md
  - design/stories/mobile/42-staying-connected.md
---

# Consolidation: CadreManager

## Purpose

Integration only. The screen is a shared component; chat mounts it and themes it.

## Route

- `CadreManager` — push from Profile, title "My machines"

## What chat generates

Nothing but the route registration and theme wiring:

```tsx
<Stack.Screen name="CadreManager" component={CadreManager}
              options={{ title: 'My machines' }} />
```

The component reads from the cadre engine singleton; no props are required beyond an optional
`theme` subset.

## When there is no cadre

Under mocks (`USE_SEREUS = false`) there is no cadre to read and the component sits on its own
loading state indefinitely — which this consolidation forbids. The **integration** therefore does
not mount it at all in that case, and says plainly that machines live on the real network. The
component is untouched; chat only decides whether to mount it.

## Constraints

- The human spec is explicit: this screen is **oriented to cadre management only**. Strand
  invitations, members and guests must not appear on it.

- **Do not regenerate the component from this repo's specs.** Its contract is
  `apps/mobile/src/cadre-ui/SPEC.md`, and it is destined for extraction as a shared sereus package.
- Do not add strand membership, invitations or guests to it — chat has its own invitation flow.
- Do not wrap it in a blocking loader. A solo node cannot reliably read its own control database, so
  the component time-boxes those reads and renders with whatever returned.
- `src/cadre/CadreService.ts` still imports `CHAT_SAPP_ID` from the data layer; that single coupling
  must become `configure({ sAppId })` before extraction (`specs/mobile/STATUS.md`).

## Open

Adding a machine is currently a seed handed over out of band; removal is not fully supported beneath
the UI; status renders as unknown until live probing is wired. Health's *Sereus Connections* is the
furthest-along sibling.
