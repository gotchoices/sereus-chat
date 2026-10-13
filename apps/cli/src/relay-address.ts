/**
 * Turning what a person types for a relay into the full address a node needs.
 *
 * A relay address ends in `/p2p/<the relay's peer id>`: the node refuses anything else
 * answering there, so a relay cannot be impersonated. People should not have to type that,
 * so serchat accepts shorter forms and fills the rest in:
 *
 *   /dns4/host/tcp/4011/ws/p2p/12D3…   used as given
 *   host  or  host:port                its published address (`_dnsaddr.<host>` TXT, how a
 *                                      Sereus relay operator publishes one), else WebSocket
 *                                      on the port given or the relay default 4011
 *   /dnsaddr/host                      its published address
 *   a multiaddr without /p2p/          as given
 *
 * Where the peer id is still unknown, serchat connects once and records who answered. That
 * trusts the first answer, so the result says how the id was learned.
 */
import { resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';

/** A Sereus relay's WebSocket port as deployed (sereus `ops/docker`: `HOST_WS_PORT`, 4011). */
export const DEFAULT_RELAY_WS_PORT = 4011;

export type RelaySource = 'as given' | 'published by DNS' | 'learned by connecting';

export interface ResolvedRelay {
  addr: string;
  source: RelaySource;
}

/** Connect to an address and return the peer id that answered. */
export type LearnPeerId = (addr: string) => Promise<string>;

export async function resolveRelayAddress(input: string, learn: LearnPeerId): Promise<ResolvedRelay> {
  const text = input.trim();
  if (text.startsWith('/')) {
    if (text.includes('/p2p/')) return { addr: text, source: 'as given' };
    const dnsaddr = /^\/dnsaddr\/([^/]+)$/.exec(text);
    if (dnsaddr) {
      const published = await publishedAddress(dnsaddr[1]);
      if (!published) throw new Error(`no relay address is published for ${dnsaddr[1]}`);
      return { addr: published, source: 'published by DNS' };
    }
    return learned(text, learn);
  }
  const match = /^(?:wss?:\/\/)?([^/:\s]+|\[[^\]]+\])(?::(\d+))?\/?$/.exec(text);
  if (!match) throw new Error(`not a relay address or host name: ${JSON.stringify(input)}`);
  const host = match[1].replace(/^\[|\]$/g, '');
  const port = match[2] ? Number(match[2]) : undefined;
  if (port === undefined && !isIP(host)) {
    const published = await publishedAddress(host);
    if (published) return { addr: published, source: 'published by DNS' };
  }
  const proto = isIP(host) === 6 ? 'ip6' : isIP(host) === 4 ? 'ip4' : 'dns4';
  try {
    return await learned(`/${proto}/${host}/tcp/${port ?? DEFAULT_RELAY_WS_PORT}/ws`, learn);
  } catch (err) {
    // Not a guess made silently: only a hint, when relay.<host> publishes a relay address.
    const hint = !isIP(host) && !host.startsWith('relay.') && (await publishedAddress(`relay.${host}`)) ? ` Did you mean relay.${host}?` : '';
    throw new Error(`${(err as Error).message}, and ${host} publishes no relay address.${hint}`);
  }
}

async function learned(addr: string, learn: LearnPeerId): Promise<ResolvedRelay> {
  let peerId: string;
  try {
    peerId = await learn(addr);
  } catch (err) {
    throw new Error(`nothing answered at ${addr}${err instanceof Error && err.message ? ` (${err.message})` : ''}`);
  }
  return { addr: `${addr}/p2p/${peerId}`, source: 'learned by connecting' };
}

/**
 * The WebSocket address a host publishes in its `_dnsaddr` TXT record, peer id included, or
 * null. serchat (like a phone) dials WebSocket only, so TCP entries are skipped.
 */
export async function publishedAddress(host: string): Promise<string | null> {
  let records: string[][];
  try {
    records = await resolveTxt(`_dnsaddr.${host}`);
  } catch {
    return null;
  }
  const addrs = records.map(chunks => chunks.join('')).filter(r => r.startsWith('dnsaddr=')).map(r => r.slice('dnsaddr='.length));
  return addrs.find(a => /\/wss?(\/|$)/.test(a) && a.includes('/p2p/')) ?? null;
}
