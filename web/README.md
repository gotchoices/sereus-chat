# Sereus Chat — web

The public site for Sereus Chat, served at **https://sereus.org/chat/** (path-based
on the existing `sereus.org` host, so it reuses that site's TLS cert / vhost — no
separate subdomain to provision). Three jobs:

1. **Learn** about Sereus Chat and **download** the app (the landing page).
2. **Handle invitation links** for people who don't have the app yet
   (`/chat/invite/<token>` → a "you're invited, get the app" page).
3. **Contribute the deep-link association entries** so
   `https://sereus.org/chat/invite/…` opens the app directly on phones that have
   it (Android App Links / iOS Universal Links).

## Contents

| Path | What |
|------|------|
| `index.html`, `styles.css` | The landing page |
| `invite.html` | Fallback shown at `/chat/invite/<token>` when the app isn't installed |
| `images/logo.svg` | Logo |
| `.well-known/assetlinks.json` | Chat's Android App-Links statement (merged into the apex on deploy) |
| `.well-known/apple-app-site-association` | Chat's iOS Universal-Links detail (merged into the apex on deploy) |
| `server.sh` | Local preview (`./server.sh` → http://localhost:8080/chat/) |
| `publish.sh` | Deploy to `sereus.org/chat` (+ merge into the apex `.well-known`) |

The APK (`chat.apk`) is **not** in this repo — it's built and published separately
into `sereus.org/chat/`, so the `Download APK` link and `publish.sh`'s `--delete`
leave it alone.

## Deep links (App Links / Universal Links) — and the apex `.well-known`

The app registers `https://sereus.org/chat/invite/<token>` (see `../apps/mobile` —
`AndroidManifest.xml`, `ios/mobile/mobile.entitlements`, `src/data/inviteLink.ts`).

**Important:** App Links (Android) and Universal Links (iOS) only read the
association files at the **host root** — `https://sereus.org/.well-known/…`, never
`https://sereus.org/chat/.well-known/…`. That root is **shared** with other Sereus
apps (e.g. health at `sereus.org/health`), so this repo keeps only *chat's own*
association entries in `web/.well-known/`, and `publish.sh` **merges** them into the
apex files by key (`package_name` for Android, `appID` for iOS) — it never
overwrites or `--delete`s the shared files.

Serving requirements for the apex files (`sereus.org/.well-known/`):
- Reachable over **HTTPS with a valid cert**, **no redirect**, **no auth**.
- `apple-app-site-association` served with **`Content-Type: application/json`** and
  **no file extension**.

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
to the `mobile` target so `ios/mobile/mobile.entitlements` (`applinks:sereus.org`)
is compiled into the build.

### `/chat/invite/<token>` routing

For the browser fallback, the host must rewrite `/chat/invite/*` to
`/chat/invite.html` (which reads the token client-side). Example nginx:

```nginx
location /chat/invite/ { try_files $uri /chat/invite.html; }
```

Apache (`.htaccess` under the `chat/` dir):

```apache
RewriteEngine On
RewriteRule ^invite/.*$ /chat/invite.html [L]
```

## Preview locally

```bash
./server.sh          # http://localhost:8080/chat/
```

`http.server` does no rewriting, so preview the invite page directly at
`/chat/invite.html?token=DEMO`.

## Publish

```bash
./publish.sh                          # → root@gotchoices.org, /var/www/sereus.org
./publish.sh user@host /var/www/sereus.org   # override remote + sereus.org docroot
```

`publish.sh` rsyncs the page content into `sereus.org/chat` (with `--delete`,
scoped to chat's own dir) and **merges** chat's `.well-known` entries into
`sereus.org/.well-known/` without touching other apps' entries. Requires ssh
access to the host that serves `sereus.org`.
