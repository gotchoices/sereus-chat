# CadreManager component

A React Native drop-in screen for viewing and managing a Sereus cadre — the
user's own machines, and the owner key that binds them. Designed to be
**app-agnostic** so any sereus app can embed it on a settings/profile route.

Developed in chat first. Much of what sits beneath it (reading node codes,
sorting a claim's failure) is expected to move into sereus itself
(gotchoices/sereus#45); health has the same pieces today. The component's
contract is the `cadre` area of a `ChatModel` (`@chat/core`), so it renders the
same over the Sereus model or the mock.

## Scope

What the component owns:

- **Network ID** — the party id, tap-to-copy
- **Owner key** — its fingerprint, and a guarded backup
- **My machines** — this device first, then the machines it has claimed;
  add (claim) and remove

What the component does **not** own:

- **Strand-level membership / partners / guests.** App-specific — chat has its
  own invitation flow. Apps render their own widgets below the component.
- **The scanner.** The host passes `onScan` to offer one, and hands a scanned
  code back as `nodeCode`.

## Adding a machine (sereus 1.14 claiming)

A machine waiting to join shows a **node code** (`sereus-join:…`, as a QR code,
a link or text). The user scans or pastes it; the component reads it, asks —
showing the machine's short peer id, the owner key it will belong to, and
whether it can be reached from anywhere or only on its own network — and then
claims it. A failure says what to do (join its Wi-Fi, check it is running) and
offers to retry when retrying can help.

The code carries a one-time claim secret: it is never logged or displayed back.

## Sections

- **Status strip** — running · owner key on file · how many other machines.
- **Network ID** — one card, truncated, tap to copy.
- **Owner key** — fingerprint and a *Back up* action, behind a confirmation;
  shows the private key in `SecretDisplayModal`. "Not ready" until owner
  genesis has run, and adding is disabled until then.
- **My machines** — "This device" first, never removable. Each other machine:
  short peer id, full peer id (tap to copy), remove (confirmed). `+` offers
  *Scan its code* (when the host gave `onScan`) or *Paste its code*.

Status is best-effort and never blocks: the list comes from a bounded read of
the control network and fills in when it answers.

## Reusability requirements

- **No host-app imports.** Data only through the `ChatModel` it is given.
- **Theme via prop or context.** All colors are tokens in [theme.ts](theme.ts);
  `<CadreManager theme={...} />` takes any subset of `CadreManagerTheme`.
- **i18n-friendly.** Visible strings are centralised at the top of the
  component.

## Embedding

```tsx
import { CadreManager } from './cadre-ui';

<CadreManager
  model={chatModel}
  theme={tokens}
  onScan={() => navigation.navigate('QrScanner')}
  nodeCode={route.params?.nodeCode}
  onNodeCodeHandled={() => navigation.setParams({ nodeCode: undefined })}
/>
```

## Out of scope (today)

- Device invitations (another phone joining as a peer of this cadre)
- Live status probes and "last heard from"
- Device names / labels
- Opening a node-code link from outside the app (the `sereus-join:` scheme
  would be claimed by every sereus app on the phone)

## Provenance

Layout from health's *Sereus Connections*, with strand guests removed; the
claiming flow follows health's (`readNodeCode` → approve → `claimNode`).
