/**
 * @format
 *
 * Entry point. Every polyfill runs before any library code: App.tsx pulls in
 * modules that touch these globals at module scope, so an import ordered after
 * the app tree is an import that ran too late.
 *
 * THE POLYFILLS ARE THE SEREUS KIT'S: `@serfab/cadre-rn/polyfills` is the maintained
 * account of what the sereus + optimystic + libp2p stack needs from Hermes. Chat once
 * carried its own copies, and the cost of that divergence was real (an
 * `AbortController.abort()` wrapper that dropped every abort reason). Fix bugs
 * UPSTREAM; do not patch around them here.
 *
 * Native Ed25519 and digest come from the kit too (`/polyfills/native-crypto`, sereus#33,
 * since 1.15), so chat carries no polyfills of its own.
 */

// Debug namespaces. Before the kit's polyfills, which set a default only when
// nothing is set — so whatever this file chooses wins. Kept as our own module
// because it documents which namespaces are worth turning on for this app, and
// the one that will not resolve (`libp2p:*`, via weald) under our Metro config.
import './src/debug-bootstrap';

// The stack's Hermes gaps: crypto, TextDecoder, structuredClone, Web Streams,
// DOMException, the AbortSignal family, WebSocket.bufferedAmount, timer ref(),
// EventTarget, Intl.PluralRules.
import '@serfab/cadre-rn/polyfills';
// Native Ed25519 and SHA digest through react-native-quick-crypto, before libp2p loads:
// @libp2p/crypto picks WebCrypto or pure JS once, when it is first imported.
import '@serfab/cadre-rn/polyfills/native-crypto';
// Development builds: the native / polyfilled / gap / MISSING table, and a
// `[reload] <reason>` line. Position is the point: after every polyfill, before the
// app tree evaluates, so the table beats any import-time crash from a missing global.
import '@serfab/cadre-rn/boot-check';

// ── App entry ──────────────────────────────────────────────────────────────
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
