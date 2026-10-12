# Sereus Chat — app family structure

How the group of Sereus Chat apps is meant to be organized. This is the target
shape; the steps to reach it from today's single app are in
[STATUS.md](STATUS.md).

## Principles

1. **Familiar, not identical.** Each app feels native to its platform. A user
   moving between phone and browser recognizes the concepts (strands, members,
   invitations, reachability) and the vocabulary, not a pixel-for-pixel copy.
2. **One wire contract.** All apps speak the same sApp schema and invitation
   formats. There is exactly one copy of each; apps that drift cannot talk.
3. **Control logic is written once.** Everything that is not presentation —
   queries, writes, strand attach and re-attach, invitations, device-local
   state, refresh policy, derived state — lives in shared code and is tested in
   Node.
4. **UI is written per platform.** No cross-framework UI layer. Screens are thin
   bindings over shared stores.
5. **The app builds the node; the core uses it.** Bringing up a Sereus node is
   platform work: native storage, transports, crypto, background execution.
   Sereus ships that work for each platform (the `@serfab/cadre-rn` kit on
   React Native, the reference apps elsewhere), and the app uses it. The core is
   handed a running node and never constructs one. The one exception is
   diagnostics that need a second party in the same process: they ask the host
   for an extra node (`createExtraNode`) rather than building it.
6. **One model, two implementations.** Screens see one interface. Behind it are
   a mock (fixtures, in-memory writes) and the Sereus implementation, and a
   single contract test suite holds both to the same behavior.
7. **Runtime diversity is an asset.** The family deliberately spans several
   JavaScript engines. When the Sereus stack misbehaves, the same shared code
   running on another engine tells a runtime defect apart from a logic defect.

## Members

| App | Folder | Platform | Framework | Engine | Role |
|-----|--------|----------|-----------|--------|------|
| mobile | `apps/mobile` | iOS / Android | React Native (bare) | Hermes | Primary mobile app |
| web | `apps/web` | Desktop browsers | SvelteKit | Browser engine | Browser client |
| mobile-ns | `apps/mobile-ns` | iOS / Android | NativeScript | V8 (Android) / JSC (iOS) | Comparison twin of mobile; same experience, different runtime |
| desktop | `apps/desktop` | — | — | — | Possible later |

Plus two non-app consumers of the shared code:

- **Node harness** (`test/`) — integration and reproduction runs that drive the
  *same* shared code the apps run, rather than a hand-built imitation of it.
- **Landing site** (`site/`) — the static `sereus.org/chat` pages and the
  App Link / Universal Link association files. Not an app; shares only brand
  resources.

`mobile-ns` exists to answer "is it the runtime?" It carries no product
features of its own and does not diverge from `mobile` in behavior. It is built
only if an engine probe points at the runtime (STATUS, Phase 8).

## Repository layout

```
chat/
  apps/                    deployable apps — one per Appeus target
    mobile/                React Native (stays where it is)
    web/                   SvelteKit
    mobile-ns/             NativeScript (only if needed)
  packages/                shared libraries — never deployed on their own
    core/                  @chat/core: protocol, model, Sereus + mock implementations, stores, diagnostics
    resources/             @chat/resources: strings, design tokens, brand art
  design/                  Appeus design surface (stories, specs, domain contract)
  test/                    Node harness: integration, repros, cross-runtime runs
  mock/                    shared fixture data (domain-shaped JSON)
  site/                    static landing site + .well-known association files
  docs/                    project documentation (this file)
  package.json             Yarn workspace root for packages/* and test/*
```

### Why `packages/`, not `apps/lib`

- `apps/` holds **deployables only**. Appeus treats every `apps/<name>` as a
  target with its own specs, STATUS and generation; a library there would look
  like a target to its scripts.
- `packages/*` is the convention the Sereus, Optimystic and Quereus repos
  already use. Anyone who works in the stack repos will find their way around
  this one.
- Libraries are named for what they hold (`core`, `resources`), not for being
  shared — everything in `packages/` is shared by definition.

### How apps consume the packages

The root `package.json` is a Yarn workspace over `packages/*` and `test/*`
only. **Apps are not workspace members.** Each app keeps its own lockfile and
`node_modules`, depends on a package as `"@chat/core": "link:../../packages/core"`,
and consumes the package's **built** `dist/`.

Why:

- React Native autolinking, CocoaPods and Gradle expect native modules in the
  app's own `node_modules`. Hoisting them into a shared root breaks builds in
  ways that are slow to diagnose.
- Each app's bundler (Metro, Vite, webpack) compiles only its own source. The
  core arrives as plain ESM JavaScript plus declarations, the same thing the
  Node harness runs.
- Each app upgrades its native and framework dependencies on its own schedule.

What it costs:

- **A build step.** `yarn build` in `packages/core` (or `tsc -b --watch` while
  developing). Each app has a script that builds its packages first.
- **Bundler wiring.** Metro needs the package folders in `watchFolders`. Jest
  needs the equivalent in its roots. That much makes linked code visible; it
  does not make it resolve correctly (next section).

### Linked code must resolve the app's copy of the stack

Bundlers resolve a linked package by its real path. An import of
`@serfab/cadre-core` from `packages/core/dist/…` walks up from there and finds
`packages/core/node_modules` or the root `node_modules` (both hold the stack,
for the core's own tests and for `test/stack`) **before** the app's copy.
Metro's `resolver.nodeModulesPaths` and Jest's `modulePaths` are searched only
after that walk, so adding them does not help. The result is two copies of
cadre-core, libp2p and `@libp2p/interface` in one bundle: transports that
silently fail to register, `instanceof` checks that fail.

The rule:

- **Pin the core's peer dependencies, for imports made from linked packages.**
  When a file under `packages/*` imports one of `@chat/core`'s
  `peerDependencies`, the app's bundler resolves it from the app's own
  `node_modules`. Everything those packages import then resolves from the
  app's copy by the normal walk.
- **Pin nothing else.** Not `@noble/*`, `@multiformats/*` or other transitive
  packages: different stack packages legitimately use different major versions
  of them, and a blanket pin would hand one of them the wrong one.
- **Per bundler:**
  - **Metro:** a `resolveRequest` that checks the importing file's path and the
    module name against the peer list, generated from `packages/core/package.json`.
    It extends the existing `@babel/runtime` pin in
    `apps/mobile/metro.config.js`.
  - **Jest:** the same, as a custom resolver.
  - **Vite:** `resolve.dedupe` with the peer list only.
  - **webpack:** `resolve.alias` for the peer list.
- **A build check:** each app's build fails if more than one copy of
  `@serfab/cadre-core` or `@libp2p/interface` is bundled. For Metro, inspect the
  module map; for Vite, a small plugin.

### Where an app touches the stack

An app **installs** the stack: native modules autolink only from its own
`node_modules`, and its copy is the one every bundle resolves to. An app
**imports** the stack in exactly two places:

- **The polyfill entry** (`index.js` on React Native), which must run before
  any other module.
- **`src/host/`**: building the node (for example `createPhoneNode`, with the
  native LevelDB constructors and native Noise crypto), the slot storage, and
  the extra-node factory for diagnostics.

Everything else imports `@chat/core`, which re-exports the stack types screens
need. A lint rule (`no-restricted-imports` on the stack's package scopes,
allowed only in those two places) enforces it.

A shared host package per platform (`packages/host-rn`) is not needed while each
platform has one app. Revisit if two apps ever share a platform.

### Packages are private

All packages are private (`"private": true`) and are never published. There is
no public API or compatibility promise to outside apps.

Whether to offer a public, stable API — so others can build compatible apps —
is deliberately deferred until the core has stabilized across at least two of
our own apps. Until then:

- Do not add publishing steps, npm scopes, or public-API versioning.
- Keep `core/protocol` free of imports from the rest of the core. It is what a
  compatible app would need, and keeping it separable means a later public
  `protocol` package is a move, not a rewrite.

## Layers and dependency rules

```
   UI (per app)          screens, navigation, device features
        │ binds to (thin binding per framework)
   stores                framework-neutral, ref-counted          ┐
        │ read and act through                                    │
   ChatModel             one interface: mock │ sereus             │ packages/core
        │ sereus implementation is given                          │
   protocol              schema, invitation formats, sApp id      ┘
        ▲
   host (per app)        a running node + durable text slots, built by the app
```

- `packages/core` imports **no** platform module and **no** UI framework. Its
  runtime dependencies are the Sereus stack (as peers) and plain TypeScript.
- Platform capabilities arrive in a `ChatHost` when the model is created, never
  through module-level imports.
- Apps depend on `packages/*`. Apps never import from each other. Packages never
  import from apps.
- Screens never call the Sereus stack. The app imports the stack only to build
  its host and load its polyfills (*Where an app touches the stack*).

## `packages/core`

| Folder | Holds |
|--------|-------|
| `protocol/` | The chat sApp schema, generated from `design/specs/domain/chat-sapp.qsql` (the single source) into a TypeScript module; the sApp id and config; the invite link and QR payload formats, encode and parse; link host and scheme constants. Imports nothing else from the core. |
| `model/` | The `ChatModel` interface, one file per namespace (below). Each holds that namespace's shapes, policy constants, pure derivations and its slice of the interface. Plus `Result`, the error kinds, and the change signals. |
| `sereus/` | The Sereus implementation of `ChatModel` over a `ChatHost`: strand attach and re-attach, remembered joins, discovery, queries and writes, invitations, device-local state over slots, the data-format check. |
| `mock/` | The mock implementation over an injected `FixtureSource`, with in-memory writes and variants. |
| `stores/` | The store primitive, the loader store, and the screen-level stores (strand list, chat, invitation status, reachability, cadre manager). |
| `diagnostics/` | Stack checks runnable on every runtime (two-party, found strand, handshake cost, loop lag), and the dev-bridge command set. |

### `ChatModel`

One object with a namespace per area of the product:

| Namespace | Covers |
|-----------|--------|
| `strands` | List and summaries, settling and boot state, mute and archive, strand state, leave |
| `messages` | Page, send, edit, delete, react, unreact; drafts and read cursors |
| `members` | List, remove, resign as manager |
| `invitations` | Create with terms, list outstanding with use counts, inspect, accept, cancel listing; join-failure kinds |
| `media` | Attachments: list, add to a send |
| `search` | Streaming search |
| `profile` | The local profile and its sync to strands |
| `prefs` | App preferences: behavior settings, storage ceiling |
| `reachability` | Relays: read the configured relays and the reservation state, change the relays, and say whether this device can be invited |
| `cadre` | The cadre manager's operations (keys, seeds, devices) |

Rules, all inherited from experience with the current adapter:

- **Every operation is async**, even where the mock answers at once, because
  the Sereus implementation will not.
- **Operations return `Result<T>`**, never throw for expected failures:
  `{ ok: true, value }` or `{ ok: false, error }`, where `error` is a
  `ChatError` with a `kind` (a stable code such as `'unreachable'`,
  `'token-spent'`, `'not-a-member'`), `retryable`, and optional `detail` for
  logs. UIs render the kind through the string catalogs. Today's
  `explainJoinFailure` English text becomes kinds.
- **Change signals are scoped.** `changes.strands(fn)` fires when the set of
  strands or a summary changes (node strand events, discovery, local writes).
  `changes.strand(id, fn)` fires when that strand's tables change (today's
  `watchStrand`: `Database.watch` over Message, Reaction, Attachment, Member).
  Both return an unsubscribe function. A global "everything is stale" signal
  exists only for world swaps: a mock variant change, a node restart onto
  different storage.
- **The model is chat's product model, not a general one.** A different product
  on Sereus builds on the stack directly.

### The host

What an app must supply to create the Sereus model:

```ts
interface ChatHost {
  node: NodeHost;                       // the app's running node
  slots: (name: SlotName) => DurableSlot; // device-local state, one text slot per record
  createExtraNode?: (options: ExtraNodeOptions) => Promise<CadreNode>; // diagnostics only
  log?: Logger;
  now?: () => number;                   // tests drive time
}

/** The shape of cadre-rn's PhoneNode, which every platform's host matches. */
interface NodeHost {
  readonly node: CadreNode | null;      // null while stopped or starting
  readonly options: NodeOptions | null; // what it last started with: party id, relays, crypto mode
  readonly status: NodeStatus;          // stopped | starting | running | failed
  onStatus(listener: (s: NodeStatus) => void): () => void;
  on<K extends keyof CadreNodeEvents>(event: K, h: (d: CadreNodeEvents[K]) => void): () => void;
  start(options: NodeOptions): Promise<CadreNode>;
  restart(options: NodeOptions): Promise<CadreNode>;
  stop(): Promise<void>;
  loadSavedStart(): Promise<SavedStart | undefined>;
}
```

- **`NodeHost`** matches `@serfab/cadre-rn`'s `PhoneNode`, so on React Native
  the host *is* `createPhoneNode(...)`. On the web and in Node it is a thin
  wrapper over a `CadreNode` the app builds:
  - **web:** modelled on `sereus/packages/reference-app-web/src/lib/cadre-web.ts`;
  - **NativeScript:** modelled on `reference-app-ns/src/cadre-phone.ts`;
  - **Node harness:** cadre-core with `classic-level`.

  `on(...)` must keep its subscriptions across restarts, so the model never
  re-subscribes after a node rebuild.
- **`DurableSlot`** is cadre-core's shape: `load(): Promise<string | undefined>`
  and `save(text): Promise<void>`. A slot that exists but cannot be read must
  throw, not return `undefined`. The model owns what goes in each slot (JSON,
  versioned). The app decides where slots live: AsyncStorage on React Native,
  IndexedDB on the web, a file or memory in Node.
- **Relays have one home: the node's start options.**
  - **Storage:** the kit saves `relayAddrs` with every start (`loadSavedStart`),
    so they are not also kept in a `prefs` slot. Two copies of one setting
    would drift.
  - **Changing them:** `reachability` reads them from `NodeHost.options` and
    changes them with `restart({ ...host.options, relayAddrs })`. That keeps the
    party id and Noise crypto mode as they are.
  - **Status:** the reservation state comes from the node's events.
  - **First start:** the app chooses the party id and default relays.
- **`createExtraNode`** builds a second, throwaway party in the same process,
  with storage the host chooses. Only diagnostics use it (two-party checks on a
  phone). A host may omit it; those checks then report themselves unavailable.
- **Not in the host:** storage, transports, crypto and lifecycle are all inside
  the node the app built. The core reads and changes only the start options it
  needs (relays); the background runner and storage names are the app's
  business, and the core never sees them.

### Device-local state and persistence names

Every persisted name is a contract: renaming one orphans every installed
device's data. The model names its slots; the app maps slot names to storage
keys and pins that map in a test.

| Slot (core) | Holds | mobile key today |
|-------------|-------|------------------|
| `profile` | Display name and profile fields | `@sereus.chat/profile` |
| `prefs` | App preferences (relays move to the node's saved start) | `@sereus.chat/prefs` |
| `strandPrefs` | Per-strand mute and archive | `@sereus.chat/strandPrefs` |
| `strandSummaries` | Cached list rows for a fast cold start | `@sereus.chat/strandSummaries` |
| `joinedStrands` | Remembered joins, re-attached after restart | `@sereus.chat/joinedStrands` |
| `outgoingInvitations` | Invitations this device made, with use counts | `@sereus.chat/outgoingInvitations` |
| `dataFormat` | The data-format marker (`sereus-1.14`) | `@sereus.chat/dataFormat` |
| `drafts` | Unsent text per strand | `@sereus.chat/draft/<strandId>` (one key per strand) |
| `readCursors` | Last read message per strand (drives unread counts) | `@sereus.chat/read/<strandId>` (one key per strand) |

These stay with the app (node bring-up or presentation, not chat logic): the
party id, peer key, key store and strand network state used by `CadreService`
today, which become the node kit's records, and the theme mode.

### Stores

Stores are what screens bind to. They follow the Svelte store contract and add
two rules:

```ts
interface Readable<T> {
  subscribe(fn: (value: T) => void): () => void; // calls fn at once with the current value
  get(): T;
}
```

- **`get()` returns the same immutable object until the value changes.** React's
  `useSyncExternalStore` re-renders whenever the snapshot is a new object, so a
  store that rebuilds its value on every read loops.
- **Stores are reference-counted.** A store starts its work — model reads,
  change subscriptions, backstop polls — when its first subscriber arrives, and
  stops it when the last one leaves. Background work is not free: on the Galaxy
  S7, idle polls and their network checks kept the JS thread 15–19% busy and
  slowed every round trip of a send (design/specs/mobile/STATUS.md, "Where the
  time goes on 1.14"). Only what is on screen may cost anything.

The **loader store** is the one load state machine for every screen:
`{ state: 'loading' | 'ready' | 'failed', value?, error? }` over a model call
that returns `Result<T>`, with `reload()`. It re-reads on the change signal it
is given (debounced, one read at a time, one more read if a change arrives
during a read). It keeps a slow backstop poll only for what no signal covers.
Screen stores (strand list, chat, invitation status, reachability, cadre
manager) are built from it plus derived state: sorting, grouping, status codes.

Stores expose **status codes, not display text**. Each UI renders codes through
the shared string catalogs.

Binding per framework:

- **SvelteKit** — use directly (`$strandList`).
- **React Native** — a `useStore(store)` hook over
  `useSyncExternalStore(store.subscribe, store.get)`.
- **NativeScript** — a small bridge into an `Observable`.

### Fixtures

The mock reads domain-shaped JSON from the root `mock/data`. It does not import
the files itself: an app supplies a `FixtureSource`, because Metro bundles JSON
only through static `require`s. Tests read the same files from disk.

### Diagnostics and the dev bridge

`core/diagnostics` holds the checks and the dev-bridge command set: `strands`,
`send`, `arm`, `seen`, `invite`, `accept`, `traffic`. Commands run over
`ChatModel` and the `NodeHost`. Checks that need a second party (two-party,
found strand) get it from `ChatHost.createExtraNode`. Each app installs the bridge in development
builds as `globalThis.__chatDev`, so `test/devices/devtime.mjs`, `devlog.mjs`
and `devcall.mjs` drive phones, browsers and Node the same way.

## `packages/resources`

Platform-neutral data the UIs share:

- **Strings** — message catalogs per locale, keyed by meaning, including every
  error kind and status code the core emits. Each app loads them through its
  own i18n mechanism.
- **Design tokens** — color roles (light and dark), spacing, type scale, radii,
  as data. Each app maps them onto its styling system.
- **Brand art** — the canonical logo vector and the icon-generation inputs.
  Each app keeps its own icon-generation script and generated assets.

## What each app owns

- Building its node and host: the node kit or its own `CadreNode` construction,
  first-start options (party id, default relays, Noise crypto mode), background
  or lifecycle runner, the slot-to-storage mapping and its persistence names,
  and the extra-node factory for diagnostics.
- Installing the stack, and pinning linked code to that copy.
- Runtime polyfills and their audit (the set differs per engine).
- Bundler configuration (Metro, Vite, webpack) and the wiring to linked
  packages.
- All UI: screens, navigation, layout, gestures, accessibility, formatting of
  dates and numbers.
- Choosing mock or Sereus, and applying mock variants from deep links.
- Deep-link and App Link / Universal Link registration.
- Device features: camera and QR scanning, media picking, notifications,
  background execution.
- Build, signing and release (fastlane, store metadata, web deployment).
- Its port and device settings for local development.

### Runtime matrix

| | mobile | web | mobile-ns |
|---|---|---|---|
| Engine | Hermes (no JIT) | Browser | V8 (Android, JIT) / JSC (iOS) |
| Bundler | Metro | Vite | webpack |
| Node host | `@serfab/cadre-rn` `createPhoneNode` | Own, after `reference-app-web` `cadre-web.ts` | Own, after `reference-app-ns` `cadre-phone.ts` |
| Block storage | LevelDB (`db-p2p-storage-rn`) | IndexedDB (`db-p2p-storage-web`) | SQLite (`db-p2p-storage-ns`) |
| Slots | AsyncStorage | IndexedDB | SQLite or file |
| Transports | WebSockets, circuit relay | WebSockets, circuit relay, WebRTC | WebSockets, circuit relay |

## Design surface (Appeus)

- **Domain contract** (`design/specs/domain/`: `chat-sapp.qsql`, `ops.md`,
  `interfaces.md`) is shared by every target and is what `packages/core`
  implements. Changes to it land in the core first.
- **Appeus generates per target** under `apps/<target>/`. It does not know that
  the model lives in `packages/core`. `design/specs/project.md` and the root
  `AGENTS.md` say so, so that work on a target's screens binds to core stores
  rather than generating data code into the app.
- **Stories and specs are per target**, with one exception: `mobile-ns` consumes
  the `mobile` stories and specs. Its own spec folder records only what differs
  (toolchain, platform deviations it cannot avoid).
- `design/specs/project.md` lists the targets and their toolchains.

## Testing

| Level | Runs on | Drives |
|-------|---------|--------|
| Contract suite | Node | One suite run against both `ChatModel` implementations: mock and Sereus. The Sereus run has two topologies: loopback (fast, the default) and relay-only (both nodes with `listenAddrs: []`, meeting through a local relay, as phones do — the topology behind past convergence failures). Fixtures that show something the Sereus model can never produce fail it. |
| Core unit tests | Node | `protocol`, pure derivations, stores against the mock |
| Integration / repro | Node (`test/`) | The Sereus model with real storage and real relays — the same code the apps run |
| Cross-runtime diagnostics | Each app, and Node | The shared `diagnostics` module; results compared side by side |
| App e2e | Device / browser | Maestro (one flow set shared by both mobile apps, differing only by app id); Playwright for web |

A failure that reproduces in Node with `packages/core` is a logic or stack
defect. One that reproduces only on a single engine is a runtime defect. One
that reproduces only in one app is that app's defect.

## Stack versions

- One release line of the Sereus stack for the whole family.
- `packages/core` declares the stack as **`peerDependencies`**: it never brings
  its own copy. Two copies of libp2p or `@libp2p/interface` in one bundle have
  broken this app before.
- Each app depends on the same release line, and keeps the `resolutions` that
  force one copy of each stack package in its own tree. The Node harness does
  the same. Linked code is pinned to the app's copy (*Linked code must resolve
  the app's copy of the stack*).
- Separate lockfiles (root, each app) could resolve one range to different
  patch versions, testing the core against one stack and shipping another. A
  root script (today's `apps/mobile/use-stack.sh`, moved to the root) writes
  **exact** stack versions into every consumer's dependencies and
  `resolutions` together.
- A stack upgrade is validated by the core's tests and the Node harness before
  any app is touched.
- Apps add only the platform-specific stack pieces (storage adapters, native
  modules, `@serfab/cadre-rn`) and pin them to the same release line.
