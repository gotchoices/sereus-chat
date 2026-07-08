// Minimal Node.js 'os' module shim for React Native.
// Mirrors sereus/packages/reference-app-rn/polyfills/node-os.js.
//
// `@libp2p/utils`' get-thin-waist-addresses.js calls `os.networkInterfaces()`
// from `getNetworkAddrs()`, reached only when a transport creates a *listener*
// (@libp2p/websockets/listener.js, @libp2p/tcp/listener.js).  This app passes
// `listenAddrs: []`, so the call is dormant — but Metro still bundles the
// module, and an empty `{}` stub would turn any future listener into a
// `TypeError: Cannot read property 'networkInterfaces' of undefined` rather
// than an empty address list.  Return real, honest values instead.
//
// Note the node variant of get-thin-waist-addresses is what lands in the
// bundle (Metro does not apply @libp2p/utils' `browser` field re-map), so this
// shim is the only thing standing between a listener and a crash.

import { Platform } from 'react-native';

/** No inspectable network interfaces on RN — an empty set, not a crash. */
export function networkInterfaces() {
  return {};
}

export function platform() {
  return Platform.OS;
}

export function type() {
  return Platform.OS === 'ios' ? 'Darwin' : 'Linux';
}

export function hostname() {
  return 'localhost';
}

export default { networkInterfaces, platform, type, hostname };
