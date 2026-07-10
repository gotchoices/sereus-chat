# Sereus Chat — web

The public site for Sereus Chat, served at **https://chat.sereus.org/**. Three jobs:

1. **Learn** about Sereus Chat and **download** the app (the landing page).
2. **Handle invitation links** for people who don't have the app yet
   (`/invite/<token>` → a "you're invited, get the app" page).
3. **Host the deep-link association files** so `https://chat.sereus.org/invite/…`
   opens the app directly on phones that have it (Android App Links / iOS
   Universal Links).

## Contents

| Path | What |
|------|------|
| `index.html`, `styles.css` | The landing page |
| `invite.html` | Fallback shown at `/invite/<token>` when the app isn't installed |
| `images/logo.svg` | Logo |
| `.well-known/assetlinks.json` | Android App Links verification |
| `.well-known/apple-app-site-association` | iOS Universal Links verification |
| `server.sh` | Local preview (`./server.sh` → http://localhost:8080) |
| `publish.sh` | Deploy to `chat.sereus.org` via rsync |

The APK (`chat.apk`) is **not** in this repo — it's built and published separately
into the same web root, so the `Download APK` link and `publish.sh`'s `--delete`
leave it alone.

## Deep links (App Links / Universal Links)

The app registers `https://chat.sereus.org/invite/<token>` (see
`../apps/mobile` — `AndroidManifest.xml`, `ios/mobile/mobile.entitlements`,
`src/data/inviteLink.ts`). For the OS to open the app instead of the browser, the
two `.well-known` files must be served correctly:

- Both reachable over **HTTPS with a valid cert**, at the web root, **no redirect**,
  **no auth**.
- `apple-app-site-association` must be served with **`Content-Type: application/json`**
  and **no file extension** (it's already named correctly here — just don't let the
  server rewrite or 404 it).

Fill in before it will verify:

- **`assetlinks.json`** already contains the repo's **debug** signing fingerprint,
  so a debug build verifies as-is. Add your **release** fingerprint to the
  `sha256_cert_fingerprints` array before shipping a release build:
  ```bash
  keytool -list -v -keystore <release.keystore> -alias <alias> | grep 'SHA256:'
  ```
  (Or, with Google Play App Signing, use the fingerprint from Play Console →
  App integrity → App signing key certificate.)
- **`apple-app-site-association`** — replace `TEAMID` in `TEAMID.org.sereus.chat`
  with your Apple Developer Team ID (e.g. `A1B2C3D4E5`).

Also required, once (app side): in Xcode, add the **Associated Domains** capability
to the `mobile` target so `ios/mobile/mobile.entitlements` (`applinks:chat.sereus.org`)
is compiled into the build.

### `/invite/<token>` routing

For the browser fallback, the host must rewrite `/invite/*` to `invite.html`
(which reads the token client-side). Example nginx:

```nginx
location /invite/ { try_files $uri /invite.html; }
```

Apache (`.htaccess`):

```apache
RewriteEngine On
RewriteRule ^invite/.*$ /invite.html [L]
```

## Preview locally

```bash
./server.sh          # http://localhost:8080
```

`http.server` does no rewriting, so preview the invite page directly at
`/invite.html?token=DEMO`.

## Publish

```bash
./publish.sh                       # → root@gotchoices.org:/var/www/chat.sereus.org
./publish.sh user@host /some/path  # override target
```

Requires ssh access to the host that serves `chat.sereus.org`, and a DNS record +
TLS cert for the subdomain (see the design decision in `../design/`). `publish.sh`
rsyncs the site (excluding the scripts, this README, and `chat.apk`).
