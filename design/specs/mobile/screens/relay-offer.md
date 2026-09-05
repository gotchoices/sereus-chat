---
id: relay-offer
route: RelayOffer
variants: [happy, error]
description: Somebody is offering a relay. Decide whether to use it.
---

# Relay Offer

Story 42. Reached from a link — `https://sereus.org/chat/relay?addr=…` from the web, or
`sereus://relay?addr=…` from a QR or in-app.

## What to show

The stories say this screen must propose rather than apply, and what the cost is. They do not say
what a user can actually check, which is this:

- **The host, as given.** A domain (`/dns4/relay.sereus.org/…`) is worth showing plainly — it is
  somewhere the user can go and look. A bare IP tells them nothing; show it, but do not dress it up.
- **The peer id, and that it is pinned.** This is the one hard guarantee here: the address names a
  specific key, and a machine that does not hold it cannot answer. Say so — *you will always be
  talking to this same machine* — because it is true, checkable, and the only certainty on offer.
- **Any name the link claims**, marked as the claim it is. The link says who runs this; nothing
  proves it.

## Deliberate choices

Accepting adds a relay; it does not replace one. More than one may be in use, and losing one should
not mean losing reachability.

Declining leaves no trace and is not confirmed — nothing happened.
