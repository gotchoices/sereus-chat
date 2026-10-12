# Sereus Chat — app family structure

How the group of Sereus Chat apps is meant to be organized. This is the target
shape, not a migration plan; progress toward it is tracked in
[STATUS.md](STATUS.md).

## Principles

1. **Familiar, not identical.** Each app feels native to its platform. A user
   moving between phone and browser recognizes the concepts (strands, members,
   invitations, reachability) and the vocabulary, not a pixel-for-pixel copy.
2. **One wire contract.** All apps speak the same sApp schema and invitation
   formats. There is exactly one copy of each; apps that drift cannot talk.
3. **Control logic is written once.** Everything that is not presentation —
   node lifecycle, strand attach/re-attach, queries, invitations, preferences,
   refresh policy, derived state — lives in shared code and is tested in Node.
4. **UI is written per platform.** No cross-framework UI layer. Screens are thin
   bindings over shared view-models.
5. **Runtime diversity is an asset.** The family deliberately spans several
   JavaScript engines. When the Sereus stack misbehaves, the same shared code
   running on another engine tells a runtime defect apart from a logic defect.

## Members

| App | Folder | Platform | Framework | Engine | Role |
|-----|--------|----------|-----------|--------|------|
| mobile | `apps/mobile` | iOS / Android | React Native (bare) | Hermes | Primary mobile app |
| mobile-ns | `apps/mobile-ns` | iOS / Android | NativeScript | V8 (Android) / JSC (iOS) | Comparison twin of mobile; same experience, different runtime |
| web | `apps/web` | Desktop browsers | SvelteKit | Browser engine | Browser client |
| desktop | `apps/desktop` | — | — | — | Possible later |

Plus two non-app consumers of the shared code:

- **Node harness** (`test/`) — integration and reproduction runs that drive the
  *same* shared code the apps run, rather than a hand-built imitation of it.
- **Landing site** (`site/`) — the static `sereus.org/chat` pages and the
  App Link / Universal Link association files. Not an app; shares only brand
  resources.

`mobile-ns` exists to answer "is it the runtime?" It carries no product
features of its own and does not diverge from `mobile` in behavior.

## Repository layout

```
chat/
  apps/                    deployable apps — one per Appeus target
    mobile/                React Native
    mobile-ns/             NativeScript
    web/                   SvelteKit
  packages/                shared libraries — never deployed on their own
    core/                  control layer, view-models, diagnostics
    resources/             strings, design tokens, brand art
  design/                  Appeus design surface (stories, specs, domain contract)
  test/                    Node harness: integration, repros, cross-runtime runs
  mock/                    shared mock data (domain-shaped)
  site/                    static landing site + .well-known association files
  docs/                    project documentation (this file)
  package.json             workspace root: workspaces, stack version pins
```

### Why `packages/`, not `apps/lib`

- `apps/` holds **deployables only**. Appeus treats every `apps/<name>` as a
  target with its own specs, STATUS and generation; a library there would look
  like a target to its scripts.
- `apps/*` + `packages/*` is the standard Yarn workspace convention, and it is
  the one the Sereus, Optimystic and Quereus repos already use. Anyone who works
  in the stack repos will find their way around this one.
- Libraries are named for what they hold (`core`, `resources`), not for being
  shared — everything in `packages/` is shared by definition.

### Packages are private

All packages are private workspace packages (`@chat/core`, `@chat/resources`,
`"private": true`), consumed by the apps as `workspace:*`. Nothing is published
to npm, and there is no public API or compatibility promise to outside apps.

Whether to offer a public, stable API — so others can build compatible apps —
is deliberately deferred until the core has stabilized across at least two of
our own apps. Until then:

- Do not add publishing steps, npm scopes, or public-API versioning.
- Keep the **protocol modules** (`schema`, the domain types in `ops`,
  `invitations`) free of dependencies on `node`, `strands`, `view-models` and
  `diagnostics`. They are what a compatible app would need, and keeping them
  separable means a later public `protocol` package is a move, not a rewrite.

## Layers and dependency rules

```
   UI (per app)         screens, navigation, device features
        │ binds to
   view-models          framework-neutral stores           ┐
        │ use                                              │ packages/core
   control layer        node service, strands, ops, prefs  ┘
        │ is given
   platform (per app)   storage, key-value, secure store, transports, polyfills
```

- `packages/core` imports **no** platform module and **no** UI framework. It
  depends only on the Sereus stack and plain TypeScript.
- Platform capabilities are **injected** when the core is constructed, never
  imported at module level.
- Apps depend on `packages/*`. Apps never import from each other. Packages never
  import from apps.
- Apps do not call the Sereus stack directly except to build their platform
  pieces (storage adapter, transports). Everything else goes through the core.

## `packages/core`

| Module | Holds |
|--------|-------|
| `schema` | The chat sApp schema and config, built from the domain contract (`design/specs/domain/chat-sapp.qsql`), which stays the single source |
| `ops` | The operations interface and domain types every UI consumes (the contract in `design/specs/domain/ops.md`) |
| `adapters` | The Sereus implementation of `ops`, and the mock implementation |
| `node` | Cadre node lifecycle: construction from a `Platform`, start/stop, owner genesis, relays, reachability, rebuilds |
| `strands` | Found, join, attach, re-attach after restart, remembered joins, discovery subscription, leave |
| `invitations` | Create, inspect, accept; invite link and QR payload encode/parse; link host and scheme constants |
| `state` | Preferences, per-strand settings, summary caches — all over the injected key-value store |
| `view-models` | Observable stores for the strand list, a chat, invitation status, reachability, the cadre manager |
| `diagnostics` | Stack checks (two-party, handshake cost, loop lag) runnable on every runtime |

### The `Platform` interface

What an app must supply. It stays small; anything platform-neutral belongs in
the core instead.

```ts
interface Platform {
  kv: KeyValueStore;                          // small durable settings (AsyncStorage, SQLite, IndexedDB)
  rawStorage(scope: string): IRawStorage;     // Optimystic block storage per database
  secureStore: SecureStore;                   // keys and secrets
  peerKey: PeerKeyStore;                      // stable libp2p identity across restarts
  transports(): TransportFactory[];           // e.g. websockets + circuit relay (+ WebRTC where native)
  log?: Logger;
}
```

### View-model contract

View-models are framework-neutral stores that follow the Svelte store contract:
`subscribe(fn)` calls `fn` immediately with the current value and returns an
unsubscribe function. That one shape binds to every UI with no adapter or a
trivial one:

- **SvelteKit** — use directly (`$strandList`).
- **React Native** — `useSyncExternalStore(store.subscribe, store.get)`.
- **NativeScript** — a small bridge into an `Observable`.

View-models own refresh policy (subscriptions instead of screen-level polling),
sorting, and derived status. They expose **status codes**, not display text;
each UI renders codes through the shared string catalogs.

## `packages/resources`

Platform-neutral data the UIs share:

- **Strings** — message catalogs per locale, keyed by meaning. Each app loads
  them through its own i18n mechanism.
- **Design tokens** — color roles (light and dark), spacing, type scale, radii,
  as data. Each app maps them onto its styling system.
- **Brand art** — the canonical logo vector and the icon-generation inputs.
  Each app keeps its own icon-generation script and generated assets.

## What each app owns

- Runtime polyfills and their audit (the set differs per engine).
- Bundler configuration (Metro, webpack, Vite).
- The `Platform` implementation.
- All UI: screens, navigation, layout, gestures, accessibility.
- Deep-link and App Link / Universal Link registration.
- Device features: camera and QR scanning, media picking, notifications,
  background execution.
- Build, signing and release (fastlane, store metadata, web deployment).
- Its port and device settings for local development.

### Runtime matrix

| | mobile | mobile-ns | web |
|---|---|---|---|
| Engine | Hermes (no JIT) | V8 (Android, JIT) / JSC (iOS) | Browser |
| Bundler | Metro | webpack | Vite |
| Block storage | LevelDB (`db-p2p-storage-rn`) | SQLite (`db-p2p-storage-ns`) | IndexedDB |
| Key-value | AsyncStorage | SQLite | IndexedDB |
| Transports | WebSockets, circuit relay | WebSockets, circuit relay | WebSockets, circuit relay, WebRTC |
| Reference | `sereus/packages/reference-app-rn` | `sereus/packages/reference-app-ns` | `sereus/packages/reference-app-web` |

## Design surface (Appeus)

- **Domain contract** (`design/specs/domain/`) is shared by every target and is
  what `packages/core` implements.
- **Stories and specs are per target**, with one exception: `mobile-ns` consumes
  the `mobile` stories and specs. Its own spec folder records only what differs
  (toolchain, platform deviations it cannot avoid).
- `design/specs/project.md` lists the targets and their toolchains.

## Testing

| Level | Runs on | Drives |
|-------|---------|--------|
| Core unit tests | Node | `packages/core` with in-memory platform pieces |
| Integration / repro | Node (`test/`) | `packages/core` with real storage and real relays — the same code the apps run |
| Cross-runtime diagnostics | Each app, and Node | The shared `diagnostics` module; results compared side by side |
| App e2e | Device / browser | Maestro (one flow set shared by both mobile apps, differing only by app id); Playwright for web |

A failure that reproduces in Node with `packages/core` is a logic or stack
defect. One that reproduces only on a single engine is a runtime defect. One
that reproduces only in one app is that app's defect.

## Stack versions

- One version of the Sereus stack for the whole family, declared in
  `packages/core` and pinned in the root `package.json` `resolutions`.
- A stack upgrade happens once, at the root, and is validated by the core tests
  and the Node harness before any app is touched.
- Apps add only the platform-specific stack pieces (storage adapters, native
  modules) and pin them to the same release line.
