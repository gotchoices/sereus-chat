# CadreManager component

A React Native drop-in screen for viewing and managing a Sereus cadre — the
user's own cluster of devices. Designed to be **app-agnostic** so any sereus
app can embed it on a settings/profile route.

This package is developed in chat first, then will be proposed upstream as
`@sereus/cadre-rn-ui` (or similar). Until the upstream package exists, app
authors copy this folder verbatim.

## Scope

What the component owns:

- **Party ID** display (cadre identity, tap-to-copy)
- **My Keys** list — authority keys that authorize cadre changes
- **My Nodes** list — devices in this cadre (this device pinned first)

What the component does **not** own:

- **Strand-level membership / partners / guests.** That concept is app-specific
  — chat has its own invitation flow, other apps may surface guests on the
  same page. Apps render their own widgets below the component.
- **The chosen sApp ID.** Configured by the host app via `cadreService` setup.

## Surface

```
┌──────────────────────────────────┐
│ ← Manage Devices                 │ ← native header (host app)
├──────────────────────────────────┤
│ NETWORK ID                       │
│ ┌──────────────────────────────┐ │
│ │ 🔒 b72a42a7…           [📋]  │ │   ← tap to copy
│ └──────────────────────────────┘ │
│                                  │
│ MY KEYS (0)                  [+] │
│ ┌──────────────────────────────┐ │
│ │ No keys yet                  │ │
│ │ One is created automatically │ │
│ │ when you add your first node │ │
│ └──────────────────────────────┘ │
│                                  │
│ MY NODES (1)                 [+] │
│ ┌──────────────────────────────┐ │
│ │ 📱 This device               │ │   ← always first
│ │    online · 12D3Koo…SFPjQ    │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

## Sections

### Network ID

- Renders the party id as a single card. Truncated, full id revealed on tap.
- Tap-to-copy via `Clipboard.setString`. Brief toast/alert confirms.
- Always visible; cadre is the unit of identity in sereus.

### My Keys

- Header: `MY KEYS (n)` with a `+` icon on the right.
- Empty state: explanatory text. **A key is created Just-In-Time** the first
  time the user attempts to add a remote node — the `+` is mostly for adding
  *additional* keys later (external import, dongle).
- Each row: type icon, protection label, abbreviated public key.
- Key types surfaced (matching health's domain spec):
  - `vault` — local Keychain/Keystore (biometric)
  - `external` — JWK file or QR scan
  - `dongle` — hardware signer (future; disabled menu entry)
- Tap `+`: action sheet with the three options above; `dongle` shown disabled.

### My Nodes

- Header: `MY NODES (n)` with a `+` icon on the right.
- "This device" always appears first; never has a remove control.
- Each remote node row: device-type icon (phone/desktop/server/other),
  display name, status dot (online/unknown/unreachable), abbreviated peer id
  (tap to copy), trash icon (remove).
- Tap `+`: action sheet with options:
  - **Drone (server)** — `createSeed()` → deliver via provider API → dial
  - **Server with QR** — scan QR/link from a server you control → dial
  - **Browser node** — quoomb / web cadre node (future)
  - **Another phone** (future, relay-routed)
- "+" stays enabled even with no keys; JIT key creation runs when the user
  picks a node type.

### Connectivity (status dots)

On screen entry, status is best-effort. Initial values come from cadre state;
optional Fret/DHT probes can update them. Component renders whatever the hook
provides without blocking.

## Reusability requirements

- **No host-app imports.** The component reaches data only through the cadre
  engine (`cadreService` from `src/cadre/`). When this folder is extracted,
  the engine moves with it.
- **No theme assumption.** Inline `StyleSheet` with sensible defaults. Host
  apps can wrap or restyle; theming hook is a future enhancement.
- **i18n-friendly.** Visible strings centralised at the top of the component
  for easy override; no `t()` calls today (host apps wrap if needed).
- **Action handlers are stubs in v0.** Add-key, add-node, remove-node all
  surface intent (action sheets) but the actual cadre mutations require
  cadre-core APIs not yet wired (seed/formation flows). Each stub posts a
  clear "not yet implemented" alert; the menu structure is correct so
  wiring is incremental.

## Embedding

```tsx
import { CadreManager } from './cadre-ui';

// React Navigation example:
<Stack.Screen name="CadreManager" component={CadreManager} options={{ title: 'My Devices' }} />
```

The component reads from the cadre engine singleton; no props required.
Host apps must boot the cadre layer at app startup (chat does this in
`App.tsx` via `ensureDefaultChatStrand` which transitively calls
`cadreService.ensureStarted`).

## Out of scope (today)

- Key generation flow (real cryptographic create + Keychain/Keystore storage)
- Seed-delivery to a remote drone
- QR scan integration for server-add
- Live status probes via Fret
- Edit display names / device labels
- Theme/styling props

All of the above are tracked in the host app's STATUS.md under the cadre
surface; this SPEC.md is the canonical layout/behavior contract once wiring
catches up.

## Provenance

Adapted from `ser/health/apps/mobile/src/screens/SereusConnections.tsx`
(layout + section breakdown), with `Strand Guests` removed and JIT key
behavior added. Identifiers and copy are chat-flavored; nothing chat-specific
is imported by the implementation.
