# Sereus Chat (Built with Appeus)

Quick commands
- Start Metro: `npm start -- --reset-cache`
- Run Android: `npm run android`
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

Notes
- Variants are mock/demo only and supplied via deep links (see `appeus/reference/mock-variants.md`).
- App id: `org.sereus.chat` (Android/iOS). Update if product naming changes.


