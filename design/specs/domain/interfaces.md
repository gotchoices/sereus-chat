# Interfaces

How the chat app's domain operations bind to the sereus stack. Sereus's own concepts and APIs are documented upstream and not duplicated here:

- [sereus/docs/architecture.md](../../../../sereus/docs/architecture.md) — cadre, control network, strand
- [sereus/docs/reference-app-rn.md](../../../../sereus/docs/reference-app-rn.md) — RN stack, polyfills, Metro
- [sereus/docs/api.md](../../../../sereus/docs/api.md) — public API surface
- [sereus/packages/cadre-core/README.md](../../../../sereus/packages/cadre-core/README.md) — `CadreNode`, `StrandInstance`

## Data layer boundary

Screens call a stable internal adapter (`DataAdapter` in `src/data/`). No screen knows whether a call is fulfilled by mock JSON or live sereus, and screens do not accept a `variant` param — variant is a mock-only side-channel.

## Operation → sereus mapping

| Domain op (see `ops.md`) | Source |
|--------------------------|--------|
| `listStrands()` | Control DB (`CadreControl.Strand` joined with locally cached chat metadata) |
| `listMessages(strandId)` | Live `StrandInstance.database` for that strand (`select … from App.Message`) |
| `searchStrands(query)` | Iterate attached strand DBs; no global index (small N expected for chat) |
| `getProfile()` / `saveProfile()` | Local key-value store. Not stored in any sereus DB |
| `createInvitation()` | `cadreNode.createOpenInvitation({ sAppId })` → encode for QR / deep link |
| `acceptInvitation(token)` | `formStrand(token, disclosure)` → `registerMember(...)` |

A strand must be **attached** (its `StrandInstance.database` is ready) before per-strand reads. Attachment happens automatically for strands the user participates in; cold strands fault in on demand.

## Configuration axes

Replaces the earlier "backend modes" ladder with the choices that actually exist in sereus:

| Axis | Choices | Default for this app |
|------|---------|----------------------|
| Source | mock fixtures / live cadre | mock for dev, live for release |
| Node profile | `transaction` / `storage` | `transaction` (phone is intermittent) |
| Storage backend | in-memory / MMKV / LevelDB-RN | LevelDB-RN on device |
| Strand filter | `all` / by `sAppId` | by `sAppId = 'org.sereus.chat'` |
| Bootstrap | solo / drone-paired / seed-applied | solo initially; drone optional |

Toggled via build config. Live mode does not accept a runtime variant.

## Reactivity

Sereus does not yet expose live change subscriptions. The app **polls** strand databases (~2s) for new messages and reacts to `CadreNode` events (`strand:started`, `strand:stopped`, `strand:error`) for attach/detach. The adapter hides this — if sereus adds change feeds later, screens are unaffected.

## React Native platform gate

Sereus on RN requires a fixed set of polyfills (Hermes globals, Node-module shims) and Metro tweaks (notably the `@libp2p/crypto` browser-variant rewrite). The chat app mirrors the reference app's `index.js`, `polyfills/`, and `metro.config.js`. See [sereus/docs/reference-app-rn.md](../../../../sereus/docs/reference-app-rn.md) — not redocumented here.

## Error surfaces

| Class | Source | UX expectation |
|-------|--------|----------------|
| Cadre not connected | `CadreNode.start()` failure | Connection banner in Settings, retry |
| Strand not ready | `StrandInstance.status !== 'started'` | Per-strand loading, auto-recover on attach |
| Cohort offline | No reachable peers in strand cohort | Inline banner; writes stay local until cohort returns |
| Invitation invalid / expired | `formStrand` rejection | Friendly message on the acceptance screen |
