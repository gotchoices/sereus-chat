/**
 * WebSocket plumbing an app installs from its polyfills (`@chat/core/transport`, a subpath
 * of its own so a polyfill file loads nothing else of the core).
 */
export { batchWebSocketSends, type WebSocketPrototype } from './websocket-batching.js';
