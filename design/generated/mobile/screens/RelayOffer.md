---
provides: ["screen:mobile:RelayOffer"]
needs: ["domain:Op:Prefs.get", "domain:Op:Prefs.set"]
dependsOn:
  - design/specs/mobile/screens/relay-offer.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/stories/mobile/42-staying-connected.md
  - design/stories/mobile/02-start-a-strand.md
---

# Consolidation: RelayOffer

## Purpose

Somebody — a web page, a QR — is offering a relay. Show what it is and what it costs, then let the
user accept or decline. **Nothing is applied until they accept.**

## Route

- `RelayOffer` — modal
- App Link: `https://sereus.org/chat/relay?addr={urlencoded multiaddr}&name={optional}`
- Custom scheme: `sereus://relay?addr=…` (QR, in-app, local testing; `chat://` alias)
- Params: `{ addr, name? }`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | `addr` parses as a multiaddr carrying a peer id | happy |
| error | Missing, malformed, or no `/p2p/` component | error |

## What is parsed, and what is claimed

From the multiaddr alone:

| Shown | Source | Verifiable |
|-------|--------|------------|
| Host | `/dns4/…`, `/dns6/…` or `/ip4/…` segment | A domain is visitable; an IP is not meaningful to a user |
| Peer id | `/p2p/…` segment | **Yes** — libp2p refuses to connect to a machine that does not hold this key |
| Operator name | `name` query param | **No.** The link's claim, and rendered as such |

Reject an address with no `/p2p/` component: without a pinned identity there is no guarantee at all,
and the screen's one honest reassurance disappears.

## Implementation Notes

- Parse with `@multiformats/multiaddr` (already present via libp2p); do not hand-roll string
  splitting — malformed input must land in `error`, not a half-rendered screen.
- Accepting **appends** to `Prefs.relayAddrs`; it never replaces. De-duplicate on the full address.
  More than one relay may be in use, and losing one must not cost reachability.
- Declining pops the modal and writes nothing. No confirmation — nothing happened.
- After accepting, ask the cadre layer to reserve **without blocking the screen**: use
  `CadreNode.reserveRelays()` (fail-soft), *not* `relayAddrs` at construction, whose documented
  behaviour is to throw `RelayReservationFailedError` out of `start()` — a dead relay would then
  brick app startup.
- Reachability is not confirmed by this screen. It says a relay has been added; whether it works
  shows up where reachability is displayed (`My network`).

## Component Inventory

Reuse InvitationAcceptance's shape — offer, then cost, then decision — including worded buttons
rather than a tick and a cross. `Banner` for the error state.
