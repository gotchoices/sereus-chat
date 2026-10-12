---
id: cadre-manager
route: CadreManager
variants: []
description: The user's own machines — a shared component, not designed here.
---

# My Network

Story 42. Titled **"My network"** in chat, not "My machines": the screen covers identity, keys,
machines *and* relays, and a borrowed relay is not one of the user's machines. Chat avoids
"connections" here — that word means a strand-adjacent thing everywhere else in this app.

The screen is a composition: the shared cadre component, plus chat's own sections rendered beneath
it. That seam is the component's own (`cadre-ui/SPEC.md`: *apps render their own widgets below the
component*), and health uses it the same way for its guests.

## Chat's section: relays

How the user is reachable. Lists the relays in use, lets one be dropped, and offers to add another.
An offer arriving by link is decided on its own screen (`relay-offer.md`) — this section is the
standing state, not the decision.

Shown here rather than in Settings because a user does not distinguish "a machine of mine" from "a
relay I borrow": both are how they are connected.

## The shared component

**Not chat's to design.** Its contract is `apps/mobile/src/cadre-ui/SPEC.md`; much beneath it is
expected to move into sereus, and health's *Sereus Connections* is its sibling. A machine is added
by scanning or pasting the code it shows.

Chat owns the route, its entry from Profile, the theme passed in, and the scanner: a scanned node
code (from here or from the general Scan screen) is handed to this screen.

## Constraints

- Oriented to cadre management only. **Do not put strand invitations, members or guests on it** —
  chat has its own invitation flow
- Do not re-specify the component's layout here
