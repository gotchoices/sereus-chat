# mobile-ns — Sereus Chat on NativeScript

The NativeScript twin of `apps/mobile` (`docs/app-family.md`: "comparison twin of mobile;
same experience, different runtime"). Android runs it on **V8**, so it answers whether a JIT
engine changes what the phone can do, against React Native's Hermes on the same hardware.

**Stage 1 (now): the engine probe.** One screen runs the core's diagnostics
(`@chat/core/diagnostics`: crypto cost, found strand, two-party) with this platform's
pieces (`src/platform.ts`). The same checks run in Node (core tests) and in the RN app
(`diagnose` on its bridge). Results show on screen and in the log as `[diag] <name> <json>`.

**Stage 2 (if stage 1 is promising):** three screens — strand list, invitation, chat —
with the RN app's test IDs, so `test/gui/flows/join-and-talk.yaml` runs against it with
`APP_ID=org.sereus.chat.ns`, against serchat. No design surface of its own: it reproduces
mobile stories 01–04.

## Build and run

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
yarn install                      # own lockfile (apps are not workspace members)
yarn core:build
ns run android --device <serial>  # debug
ns build android --release --key-store-path android/... # release, see below
```

Taken from sereus's `packages/reference-app-ns` (1.14): the webpack configuration (with one
chat rule: linked packages resolve this app's stack), the polyfills and shims, the SQLite
storage adapter (`src/ns-storage.ts`) and the Android resources. App id `org.sereus.chat.ns`,
so it installs beside the RN app.
