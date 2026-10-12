# Sereus Chat (Built with Appeus)

Repository layout (see `docs/app-family.md`)
- `apps/<target>/` — deployable apps (`apps/mobile` today). Not workspace members; each has its own lockfile.
- `packages/` — shared libraries (`@chat/core`, `@chat/resources`), consumed by apps through `link:`.
- `test/stack` — Node harness. `test/devices` — device timing and capture tools.
- `site/` — the static sereus.org/chat pages and deep-link association files (`site/publish.sh`).
- `scripts/use-stack.sh` — sets the Sereus stack versions for every consumer at once (`yarn stack`).
- `scripts/relay.sh` — local libp2p relay for two-instance testing (`yarn relay`).

Quick commands
- Start Metro: `npm start -- --reset-cache`
- Run Android: `yarn android`
- Build Android APK (CI/local): `cd android && ./gradlew clean assembleDebug`

Deep linking (Android emulator)
```bash
adb shell am start -W -a android.intent.action.VIEW -d "chat://connections?variant=happy"
adb shell am start -W -a android.intent.action.VIEW -d "chat://connections?variant=empty"
```

Testing
- Unit/Component (Jest/RNTL): `npm test`
- E2E (Detox, Android):
  - Build once: `yarn detox:build:android`
  - Test: `yarn detox:test:android`
  - Fast re-run (reuse binary): `yarn e2e:android:reuse`
  - Run a single E2E file (Android, reuse emulator/app):
    - `yarn e2e:android:file e2e/chat.e2e.test.js`
    - Tip: you can pass any test file path instead of `chat.e2e.test.js`

Notes
- Variants are mock/demo only and supplied via deep links (see `appeus/reference/mock-variants.md`).
- App id: `org.sereus.chat` (Android/iOS). Update if product naming changes.


