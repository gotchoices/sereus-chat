# Sereus Integration

This app sits on top of the Sereus fabric. This file captures the integration contract — what concepts come from sereus, how the app's cadre lifecycle fits, the code-structure boundary that supports a future upstream extraction, and the open project-level decisions. For the operation-level call mapping see [interfaces.md](interfaces.md); for the data we own vs sereus owns see [schema.md](schema.md).

## What sereus provides

Owned by sereus, never redefined in this project:

- **Cadre** — the user's own devices. Provisioned via authority keys and `CadrePeer` rows in the Control DB.
- **Strand** — a P2P database shared with one or more partners. Created via `CadreNode.addStrand(...)`.
- **Control DB** — per-cadre Optimystic database (`CadreControl` schema). Source of truth for which strands the user has, who else is in the cadre, and authority keys.
- **Invitation / formation protocol** — `OpenInvitation`, `formStrand`, `registerMember`, `validateStrandFormation`.
- **Peer identity** — libp2p Ed25519 keypair, persisted on the device, reused across restarts.

## Cadre lifecycle (this app)

1. **First launch** — app starts a `CadreNode` (transaction profile). Peer identity and party ID are auto-generated and persisted. No authority key, no remote nodes, no networking yet.
2. **Solo phase** — the user can create chat strands locally and read/write the chat schema with no replication. Used for demo, onboarding, and offline.
3. **First remote node** — when the user adds a drone or another device, an authority key is created and the user's cadre is registered in the Control DB. Data then replicates across cadre nodes.
4. **First partner** — the user generates an `OpenInvitation` or accepts one; the resulting strand is added to the Control DB and joined automatically.

The chat UI never blocks on remote connectivity beyond what the user has explicitly chosen.

## Code boundary (cadre vs chat)

The long-term plan is to extract the cadre layer into two upstream sereus packages:

- `@sereus/cadre-engine` — framework-agnostic JS/TS wrapper around `CadreNode`, identity persistence, strand lifecycle, key flows
- `@sereus/cadre-rn-ui` — React Native drop-in screens (Connections, AddNode, AddGuest, Invitation accept) shared across sereus apps

To keep that extraction cheap, all chat code is written against this boundary:

- **Cadre layer** (target: `src/cadre/`) — identity, peer/node management, party/cohort state, strand registry, key/seed flows, the Connections / AddNode / AddGuest screens. **Must not import anything chat-specific.**
- **Chat layer** — per-strand `Member`/`Message` schema, message composer/list, attachments, search. May import the cadre layer; the cadre layer never imports back.

A peer effort with the same intent is already underway in [ser/health/apps/mobile](../../../../health/apps/mobile) — see [src/services/CadreService.ts](../../../../health/apps/mobile/src/services/CadreService.ts), [src/screens/SereusConnections.tsx](../../../../health/apps/mobile/src/screens/SereusConnections.tsx), and the matching domain spec [design/specs/domain/cadre.md](../../../../health/design/specs/domain/cadre.md). Align naming and structure with sereus-health where reasonable, so the eventual upstream extraction touches both apps minimally.

## Open project-level decisions

These need to be resolved in [project.md](../project.md) before the live wiring phase. Until decided, the app assumes the simpler option, matching the sereus reference app.

### Strand type: open (`'o'`) vs closed (`'c'`)

Affects the invitation flow and the strand-schema overlay sereus injects (closed strands add `Invite` / `ConsumedInvite` / `Member` / `MemberPeer` / `Authority` tables managed by sereus, not us). The reference app uses open strands.

### Drone strategy

A drone is an always-on storage-profile node providing availability when phones are offline. Options:

- **No drone** — pure phone-to-phone via circuit relay. Simplest; both phones must be reachable when messages flow.
- **User-provided drone** — power users add their own. Better availability.
- **Provider-hosted drone** — the app vendor hosts one per user. Best UX, operational cost.

Pick one (or define a progression) and adjust the cadre / connections screens accordingly.

## References

- [sereus/docs/architecture.md](../../../../sereus/docs/architecture.md)
- [sereus/docs/reference-app-rn.md](../../../../sereus/docs/reference-app-rn.md)
- [sereus/docs/api.md](../../../../sereus/docs/api.md)
- [sereus/docs/strands.md](../../../../sereus/docs/strands.md)
- [sereus/packages/cadre-core/README.md](../../../../sereus/packages/cadre-core/README.md)
- [sereus/packages/reference-app-rn/src/](../../../../sereus/packages/reference-app-rn/src/)
- Sibling work in [ser/health/apps/mobile](../../../../health/apps/mobile)
