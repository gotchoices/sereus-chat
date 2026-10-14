# mobile-ns — Sereus Chat on NativeScript

The NativeScript twin of `apps/mobile` (`docs/app-family.md`: "comparison twin of mobile;
same experience, different runtime"). Android runs it on **V8**, so it answers whether a JIT
engine changes what the phone can do, against React Native's Hermes on the same hardware.

**Stage 1: the engine probe.** A diagnostics screen (now behind the strand list's menu)
runs the core's diagnostics (`@chat/core/diagnostics`: crypto cost, found strand,
two-party) with this platform's pieces (`src/platform.ts`). The same checks run in Node
(core tests) and in the RN app (`diagnose` on its bridge). Results show on screen and in
the log as `[diag] <name> <json>`.

**Stage 2: the minimal twin.** Three screens over the core's Sereus model and stores, with
the shared strings (`@chat/resources`). No design surface of its own: just enough of mobile
stories 01–04 to join a strand from a link and talk.

- `app/strands-page`: `strandListStore` and `reachabilityStore`, plus Name… and Relay…
  buttons (this twin has no profile or network screens). The relay is a full multiaddr;
  `serchat relay` shows the one a name resolves to.
- `app/invitation-page`: inspect, then "Join this strand" / "No thanks".
- `app/chat-page`: `chatStore` (messages, pending sends) and a composer.
- `src/host.ts`: the core's `ChatHost`. One persistent `CadreNode` as the reference app
  builds it (SQLite, WebSockets and circuit relay, no listening), start options and the
  core's slots in the same SQLite `kv` table, owner genesis on start, a relay change
  rebuilding the node.
- `src/local-kv.ts`: the `kv` table written with `INSERT OR REPLACE`. optimystic's
  `SqliteKVStore` and `loadOrCreateNSPeerKey` use UPSERT, which needs SQLite 3.24
  (Android 11); the S7 (Android 8) has 3.19.
- Invitation links are `chatns://invite/<token>` (the RN app owns `chat://`). The node
  starts on the launch event: the SQLite plugin opens databases through the activity.

The GUI test drives it by on-screen words (NativeScript cannot set Android resource ids):

```sh
# once: a name and a relay
maestro --device <serial> test test/gui/flows/ns-setup.yaml -e NAME=Bob -e RELAY=<multiaddr>
# join a strand serchat made, and talk
APP_ID=org.sereus.chat.ns node test/gui/phone-joins-serchat.mjs <serial>
```

## Build and run

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
yarn install                      # own lockfile (apps are not workspace members)
yarn core:build
ns run android --device <serial>  # debug
# release, signed with the debug key so it installs over a debug build and keeps its data
# (release builds send no console output to logcat)
ns build android --release --key-store-path ~/.android/debug.keystore --key-store-password android \
  --key-store-alias androiddebugkey --key-store-alias-password android
```

Taken from sereus's `packages/reference-app-ns` (1.14): the webpack configuration (with one
chat rule: linked packages resolve this app's stack), the polyfills and shims, the SQLite
storage adapter (`src/ns-storage.ts`) and the Android resources. App id `org.sereus.chat.ns`,
so it installs beside the RN app.
