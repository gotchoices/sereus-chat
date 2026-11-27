# @chat/cadre-client

Cadre management for any Sereus app, with no UI: the party's machines (its cadrons), claiming a
node by its code, removing one, backing up the owner key, relays, whether anybody can reach this
device to answer an invitation, and which cadrons an invitation names. Every operation returns a result rather than throwing, and
each screen-sized piece of state comes as a store any UI framework binds to.

**Cadron:** one machine of a person's cadre: a phone, a home server, a rented node. This package
uses the word throughout; sereus's own APIs say machine, node or peer, and its types keep those
names at the boundary (`CadreMachine` is also exported as `Cadron`).

Built in chat, kept free of chat (a test fails if anything here imports chat code, a UI
framework or a platform module), and meant to be lifted out so health, taleus and other
Sereus apps share one implementation. It depends on `@serfab/cadre-core` only, as a peer.

## Layers

| Layer | What | Status |
|---|---|---|
| **1. Control (this package)** | Operations, results with error codes, stores. No UI, no platform. | Built; used by chat's mobile app, CLI and NativeScript app. |
| **2. React Native UI** | Drop-in screens over layer 1. | **Undecided, deliberately.** See below. |

**Layer 2 is decided by evidence, not in advance.** Chat's `apps/mobile/src/cadre-ui`
(`CadreManager`) already depends on nothing but layer 1 and takes a theme, so it can be
offered to a second app as-is. Whether it becomes a shared package depends on what that app
needs:

- If a second app can use it through props (theme tokens, strings, which sections to show)
  without forking it, extract it as a React Native package on top of this one.
- If adapting it costs about as much as building the screen from it as an example (a
  different layout, navigation, wording or design system), keep it as a boilerplate
  example to copy, and share only layer 1.

Either way the hard part — the cadre logic — is shared. Screens are cheap to write over
layer 1, and they are where apps legitimately differ.

## Entry points

- **`@chat/cadre-client`** — loads no stack code, so screens and mocks import it freely.
  Types (`CadreModel`, `CadreStatus`, `CadreMachine`, `Reachability`, `CadreView`, …),
  results (`CadreResult`, `CadreError`, `cadreOk`, `cadreFail`), node-code text
  (`isNodeCode`, `nodeCodeFromUrl`), address judgement (`nodeReach`, `isPublicAddress`), and
  stores (`cadreStore`, `reachabilityStore`, and the `writable` / `loader` primitives).
- **`@chat/cadre-client/sereus`** — over a running node. `createCadreClient(host)`,
  `edgeNodeHost(edge)`, `readNodeCode`, `classifyClaimFailure`.

## Using it

On cadre-core's edge node — React Native with `@serfab/cadre-rn`'s `createPhoneNode`, or the
web and NativeScript with `createEdgeNode` — the host is ready-made:

```ts
import { createCadreClient, edgeNodeHost } from '@chat/cadre-client/sereus';
import { cadreStore, reachabilityStore } from '@chat/cadre-client';

const cadre = createCadreClient(edgeNodeHost(phone, { ownerKeyStore }));

const machines = cadreStore(cadre);           // { state, value: CadreStatus, error }
const reach = reachabilityStore(cadre);       // { state, value: Reachability, error }

await cadre.cadre.inspectNodeCode(scanned);   // preview to approve
await cadre.cadre.claimNode(scanned);         // after the person approves
const who = await cadre.invitable();          // before minting a strand invitation
```

An app with its own node service implements `CadreHost` (a dozen members, all thin) instead;
chat's is `apps/mobile/src/host/chat-host.ts`.

Binding a store: Svelte uses it directly (`$machines`); React with
`useSyncExternalStore(store.subscribe, store.get)`; NativeScript by copying each value into
an `Observable` from `subscribe`. Stores are reference-counted: they read, subscribe and
poll only while something is subscribed.

Errors carry a stable `kind` (and sometimes a `reason`) for an app's own string catalog, plus
an English `message` for logs and as a fallback.

## Reachability: a machine of your own counts

A phone cannot accept connections, so on its own it can be reached only through a relay
reservation. But a strand invitation also names the party's other machines (cadre-core puts
their signed, recently published addresses in its bootstrap list), and an always-on machine
answers a join for the party and hosts its strands. So this device counts as reachable when:

- it holds an address of its own (`via: 'this-device'`), or
- cadre-core's `invitationReach()` says `anywhere` **and** a trusted machine of the party says
  it stays on (`via: 'own-machine'`).

Then no relay is needed to invite anyone. The reading is bounded (a control read that hangs
counts as no) and reused for 15 s.

**Caveat** (sereus `docs/network/relay.md`): a cadre-host node behind a home router forwards
only its control ports; its strand networks listen on ports the router does not map, so an
outsider can complete a join and still not sync. The rule is meant for a machine with a
public address and open ports: a server or a rented node. Sereus tracks the general fix
(`feat-phone-relays-through-its-own-always-on-node`, `feat-cadre-host-children-reserve-on-a-relay`).

## Invitations: which cadrons they name

An open strand invitation carries a bootstrap list: the addresses a joiner dials to reach one of
the inviter's cadrons. `client.invitations` decides that list and reports on it:

```ts
await client.invitations.setPreferences({ preferred: [homeServerPeerId], names: { [homeServerPeerId]: 'home' }, maxAddrs: 2 });
const plan = await client.invitations.bootstrapPlan();       // entries + warnings, before minting
const inv = await node.createOpenInvitation(sAppId, validForMs);
const token = node.encodeInvitation(await client.invitations.withBootstrap(inv));
const ready = invitationReadinessStore(client, strandId, { newStrand: true });   // 'waiting' → 'ready'
const words = await client.invitations.describe(token, link); // per address: cadron, kind, host, port; link and QR size
```

- **The list:** preferred cadrons first (the person's order), then other always-on cadrons, newest
  record first; each cadron's addresses best first (a public name or IP over WebSocket, then a
  relay, then WebRTC; private ones only if `allowPrivate`; loopback and plain TCP never); one
  address per cadron before any gets a second; at most `maxAddrs` (default 2). This device's own
  addresses (a phone's relay) go in only when no cadron reaches from anywhere (`thisDevice:
  'fallback'`, the default), or always, or never.
- **The evidence** for a cadron's addresses: a connection this device opened to it with no relay
  hop, its signed record (all of it, not cadre-core's first four), or, in the minute before its
  first record arrives, what its node code carried when it was claimed.
- **Ready to hand out:** a new strand's copy is on a cadron once a commit of it is held elsewhere;
  only then can the cadron answer a join with this device asleep. Earlier, the join is refused
  (`host-strand-unavailable`, shown as "their side could not finish"). An established strand is
  ready when another cadron serves it.
- **Preferences** are kept per device, in the host's `preferences` slot.

### Workarounds, and what replaces them

| Here | Because sereus does not yet | Replaced by (sereus) |
|---|---|---|
| `planBootstrap` replaces cadre-core's bootstrap list | rank an open invitation's addresses, or keep loopback, private and plain-TCP addresses out of a machine's published record (a cadre-host VPS node is named by unusable addresses alone) | ranked open invitations; curated published records |
| The claim's addresses for a cadron with no record yet | name a just-claimed machine in an invitation at all | the same, once records publish at claim |
| `readiness` from commit durability | say when an invitation can be answered without its minting machine | a readiness signal on the invitation |
| `CadronPreferences.preferred` and `maxAddrs`, per device | let a party choose its bootstrap machines and an address cap | a party-level bootstrap setting in the control schema |
| `withBootstrap` rewrites the invitation before encoding | take a bootstrap list (or a policy) in `createOpenInvitation` | an option on `createOpenInvitation` |

Each site in the code carries a `WORKAROUND(sereus: …)` note naming the same feature.

## Not covered yet

Compared with sereus's reference-app-rn, which has every cadre screen:

- joining an existing cadre, and the first-launch "do you already use Sereus apps?" question
  (`EdgeNode.joinCadre`, strand move, dissolving the former party);
- adding a device or app by cadre invitation, and approving join requests;
- owner keys beyond backing one up: listing, importing, removing, owner grants;
- removing a machine through `planMachineRemoval` / `removeMachine` (today `removePeer`);
- the `removed` state, app links between Sereus apps, provider rental.

Each is a cadre-core call plus state, and belongs here rather than in an app.

## Distribution

See chat's `docs/STATUS.md`, "Cadre client: getting it to other apps". In short: other apps
in the `ser/` workspace can link it today exactly as chat's apps do; the lasting home is
either sereus (as `@serfab/cadre-client`, released with cadre-core) or a repository of its own.

## Keeping it liftable

- Import only `@serfab/cadre-core` and this package's own files (`standalone.test.ts`).
- Peer-depend on cadre-core; never bring a copy.
- No UI, no platform module, no host globals beyond timers and `console` (`globals.d.ts`).
- English only in `message`; everything a UI shows is a code.
