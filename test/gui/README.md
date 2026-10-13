# GUI tests against serchat

A GUI app is driven through its screens by **Maestro** (mobile.dev); the other person in
the conversation is a **serchat** instance driven through its development bridge. One
device is enough.

| Script | What happens |
|---|---|
| `phone-joins-serchat.mjs [serial]` | serchat makes a strand and an invitation; Maestro opens the link on the phone, accepts, sends a message; serchat sees it and replies; Maestro waits for the reply on screen (`flows/join-and-talk.yaml`) |

Flows take `APP_ID`, so the same flows can drive another mobile app (NativeScript) later.
Web apps will use Playwright the same way.

Prerequisites:
- **Maestro** (mobile.dev), known to work: 2.11.0. Install with its own installer,
  `curl -Ls "https://get.maestro.mobile.dev" | bash` (into `~/.maestro`; it uses the Java
  17+ already present). Homebrew's `mobile-dev-inc/tap/maestro` failed to build here, and
  Homebrew's `maestro` *cask* is an unrelated product. The driver turns Maestro's analytics
  off (`MAESTRO_CLI_NO_ANALYTICS=1`). On Android it installs its driver apps on the device
  (`dev.mobile.maestro`, `dev.mobile.maestro.test`).
- The app in a development build with Metro, the phone set up (name and relay).
- serchat built (`yarn workspace serchat build`).
