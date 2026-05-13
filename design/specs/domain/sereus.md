# Sereus Integration

This app sits on top of the Sereus fabric. This file captures the integration contract — what concepts come from sereus, how the app's cadre lifecycle fits, the code-structure boundary that supports a future upstream extraction, and the open project-level decisions. For the operation-level call mapping see [interfaces.md](interfaces.md); for the data we own vs sereus owns see [schema.md](schema.md).

## What sereus provides

Owned by sereus, never redefined in this project:

- **Cadre** — the user's own devices. Provisioned via authority keys and `CadrePeer` rows in the Control DB. Users add and remove cadre nodes (phone, drone, quoomb browser node, …) at any time; the chat app surfaces this, sereus handles the mechanics.
- **Strand** — a P2P database shared with one or more partners. Created via `CadreNode.addStrand(...)`. The user picks open (`'o'`) or closed (`'c'`) per strand at creation; closed strands carry sereus-managed membership/invite/authority overlay tables, open strands don't.
- **Control DB** — per-cadre Optimystic database (`CadreControl` schema). Source of truth for which strands the user has, who else is in the cadre, and authority keys.
- **Invitation / formation protocol** — `OpenInvitation`, `formStrand`, `registerMember`, `validateStrandFormation`.
- **Peer identity** — libp2p Ed25519 keypair, persisted on the device, reused across restarts.

## Cadre lifecycle (this app)

1. **First launch** — app starts a `CadreNode` (transaction profile). Peer identity and party ID are auto-generated and persisted. No authority key, no remote nodes, no networking yet.
2. **Solo phase** — the user can create chat strands locally and read/write the chat schema with no replication. Used for demo, onboarding, and offline.
3. **First remote node** — when the user adds any peer node, an authority key is created and the user's cadre is registered in the Control DB. Data then replicates across cadre nodes.
4. **First partner** — the user generates an `OpenInvitation` or accepts one; the resulting strand is added to the Control DB and joined automatically.

The chat UI never blocks on remote connectivity beyond what the user has explicitly chosen.

## Code boundary (cadre vs chat)

The long-term goal is a React Native UI library — `@sereus/cadre-rn-ui` or similar — providing drop-in Connections / AddNode / AddGuest / Invitation-accept screens shared across sereus apps. A framework-agnostic engine layer is **not** assumed: sereus's existing `cadre-core` API may already be compact enough to consume directly. Only add an engine wrapper if real friction emerges during wiring.

To keep the eventual UI extraction cheap, all chat code is written against this boundary:

- **Cadre layer** (target: `src/cadre/`) — identity, peer/node management, party/cohort state, strand registry, key/seed flows, the Connections / AddNode / AddGuest screens. **Must not import anything chat-specific.** Must support every cadre/strand option sereus exposes (open and closed strands, any node type, any number of nodes).
- **Chat layer** — per-strand `Member`/`Message` schema, message composer/list, attachments, search. May import the cadre layer; the cadre layer never imports back.

A peer effort with the same intent is already underway in [ser/health/apps/mobile](../../../../health/apps/mobile) — see [src/services/CadreService.ts](../../../../health/apps/mobile/src/services/CadreService.ts), [src/screens/SereusConnections.tsx](../../../../health/apps/mobile/src/screens/SereusConnections.tsx), and the matching domain spec [design/specs/domain/cadre.md](../../../../health/design/specs/domain/cadre.md). Align naming and structure with sereus-health where reasonable, so the eventual upstream extraction touches both apps minimally.

## References

- [sereus/docs/architecture.md](../../../../sereus/docs/architecture.md)
- [sereus/docs/reference-app-rn.md](../../../../sereus/docs/reference-app-rn.md)
- [sereus/docs/api.md](../../../../sereus/docs/api.md)
- [sereus/docs/strands.md](../../../../sereus/docs/strands.md)
- [sereus/packages/cadre-core/README.md](../../../../sereus/packages/cadre-core/README.md)
- [sereus/packages/reference-app-rn/src/](../../../../sereus/packages/reference-app-rn/src/)
- Sibling work in [ser/health/apps/mobile](../../../../health/apps/mobile)
