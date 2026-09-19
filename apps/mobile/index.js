/**
 * @format
 *
 * Entry point. Every polyfill runs before any library code: App.tsx pulls in
 * modules that touch these globals at module scope, so an import ordered after
 * the app tree is an import that ran too late.
 *
 * THESE POLYFILLS ARE NOT OURS. `polyfills/` is adopted verbatim from
 * sereus/packages/reference-app-rn/polyfills, which is the maintained,
 * authoritative account of what the sereus + optimystic + libp2p stack needs
 * from Hermes. This file previously carried a hand-rolled partial copy, and the
 * cost of that divergence was real: our copy wrapped `AbortController.abort()`
 * and handed the reason to a native `abort()` that discards it, so every
 * cancellation in the bundle became a bare `undefined` and the errors that
 * followed read "Cannot read property 'message' of undefined" instead of the
 * actual fault. The reference copy had that right, and carries knowledge we
 * would not have arrived at (that `AbortSignal.any` leaks listeners on Hermes,
 * for one). Fix bugs UPSTREAM and re-copy; do not patch these files locally.
 *
 * Deliberately not adopted: `webrtc.js` (we depend on no react-native-webrtc),
 * and `reload-reason.js` / `node-crypto.js` / `node-os.js` / `empty.js`, which
 * serve that app's Expo Router entry and Metro shims.
 */

// Debug namespaces. Before `polyfills/hermes`, which sets a default only when
// nothing is set — so whatever this file chooses wins. Kept as our own module
// because it documents which namespaces are worth turning on for this app, and
// the one that will not resolve (`libp2p:*`, via weald) under our Metro config.
import './src/debug-bootstrap';

// The stack's Hermes gaps: crypto, TextDecoder, structuredClone, Web Streams,
// DOMException, the AbortSignal family, WebSocket.bufferedAmount, timer ref().
import './polyfills/hermes';
import './polyfills/intl-pluralrules';
import './polyfills/event';
// Prints the native / polyfilled / gap / MISSING table under __DEV__. Position
// is the point: after every polyfill, before the app tree evaluates, so the
// table beats any import-time crash caused by a global that is not there.
import './polyfills/audit';

// ── App entry ──────────────────────────────────────────────────────────────
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
