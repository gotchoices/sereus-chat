/**
 * Judging an address: can a device elsewhere on the Internet dial it, or only one on the
 * same network? A small built-in private-address check, so the package takes no
 * dependency beyond cadre-core.
 */
import type { NodeReach } from './model.js';

/** `anywhere` when at least one address names a public IP or a DNS name, else `home-network`. */
export function nodeReach(multiaddrs: readonly string[]): NodeReach {
  return multiaddrs.some(isPublicAddress) ? 'anywhere' : 'home-network';
}

/**
 * The address's host is a DNS name or a public IP. The host is its first IP or DNS
 * component, so a relayed address is judged by its relay.
 */
export function isPublicAddress(addr: string): boolean {
  const parts = addr.split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const [proto, value] = [parts[i], parts[i + 1]];
    if (proto === 'dns' || proto === 'dns4' || proto === 'dns6' || proto === 'dnsaddr') return true;
    if (proto === 'ip4') return !isPrivateIp4(value);
    if (proto === 'ip6') return !isPrivateIp6(value);
    if (proto === 'ip6zone') return false; // a zone names a local interface: link-local only
  }
  return false;
}

function isPrivateIp4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparsable: not public
  const [a, b] = o;
  return a === 10 || a === 127 || a === 0
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127); // carrier-grade NAT, Tailscale
}

function isPrivateIp6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp4(lower.slice(7));
  const first = parseInt(lower.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00   // fc00::/7 unique local
    || (first & 0xffc0) === 0xfe80;     // fe80::/10 link local
}

/**
 * How far an address reaches for a phone dialing it, as cadre-core's `classifyDialAddress` judges
 * it (mirrored here so this entry point loads no stack code):
 *
 * - `relay`: through a relay (`/p2p-circuit`) reached over a WebSocket, from anywhere while the
 *   reservation holds;
 * - `webrtc`: a relay hop then WebRTC, from anywhere only if ICE finds a path;
 * - `name` / `public`: a DNS name or public IP with a WebSocket, from anywhere;
 * - `private`: a private-network IP, only from the same network;
 * - `loopback`: the machine itself, never from another one.
 *
 * Null when no phone can dial it at all: plain TCP (phones dial WebSocket and relays only), a
 * relay reached over plain TCP, the unspecified address, or anything unparsable.
 */
export type CadronAddressKind = 'relay' | 'webrtc' | 'name' | 'public' | 'private' | 'loopback';

export function addressKind(addr: string): CadronAddressKind | null {
  const parts = addr.split('/').filter(Boolean);
  const circuit = parts.indexOf('p2p-circuit');
  if (circuit >= 0) {
    // The hop to the relay is dialed like any other address: a phone reaches a relay over a
    // WebSocket only, never plain TCP. (cadre-core's `classifyDialAddress` calls any relayed
    // address `relay`, so a relay's TCP port can take an invitation's slot; a sereus issue.)
    const hop = parts.slice(0, circuit);
    if (!hop.includes('ws') && !hop.includes('wss')) return null;
    return parts.slice(circuit + 1).includes('webrtc') ? 'webrtc' : 'relay';
  }
  if (!parts.includes('ws') && !parts.includes('wss')) return null;
  const [proto, host] = parts;
  if (!host) return null;
  if (proto === 'dns' || proto === 'dns4' || proto === 'dns6' || proto === 'dnsaddr') return host === 'localhost' ? 'loopback' : 'name';
  if (proto === 'ip4') {
    if (host === '0.0.0.0') return null;
    if (host.startsWith('127.')) return 'loopback';
    return isPrivateIp4(host) ? 'private' : 'public';
  }
  if (proto === 'ip6') {
    const lower = host.toLowerCase();
    if (lower === '::') return null;
    if (lower === '::1') return 'loopback';
    return isPrivateIp6(lower) ? 'private' : 'public';
  }
  return proto === 'ip6zone' ? 'private' : null;
}

/** Reaches from anywhere: what an invitation should name. */
export function reachesAnywhere(kind: CadronAddressKind | null): boolean {
  return kind === 'name' || kind === 'public' || kind === 'relay' || kind === 'webrtc';
}

/** Best first for an invitation: a direct name or public address, then a relay, then WebRTC, then private. */
export const ADDRESS_KIND_RANK: Record<CadronAddressKind, number> = { name: 0, public: 0, relay: 1, webrtc: 2, private: 3, loopback: 4 };
