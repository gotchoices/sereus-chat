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
