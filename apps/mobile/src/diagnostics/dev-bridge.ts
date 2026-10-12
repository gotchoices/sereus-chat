/**
 * dev-bridge.ts — dev-only hooks for driving the app from a test script.
 *
 * WHY. Timing a message between two devices by tapping the composer measured the
 * harness as much as the app: the dev-build LogBox toast blocked the Send button, a
 * floating keyboard sat over it, and a send that never left looked like a slow
 * delivery. This exposes the same data paths the chat screen uses, reached over
 * Metro's inspector (`Runtime.evaluate`), with no UI in between.
 *
 *   __chatDev.strands()             → [{ id, title }]
 *   __chatDev.send(strandId, text)  → { ms }      the same `send` the composer calls
 *   __chatDev.arm(strandId)         → true        watch it, as the chat screen does
 *   __chatDev.seen(text)            → epoch ms when first seen here, or null
 *   __chatDev.invite()              → { url, strandId }   a new private strand's invitation
 *   __chatDev.accept(url)           → { strandId }        join through it
 *   __chatDev.traffic(seconds)      → new streams per node, protocol and direction
 *   __chatDev.relays([addrs])       → the relays; with addrs, set them first (as RelayOffer does)
 *
 * Hermes's inspector ignores `awaitPromise`, so an async call is started with
 * `__chatDev.start(id, method, ...args)` and its outcome collected later with
 * `__chatDev.take(id)` → undefined while pending, then { ok, value } or { ok: false, error }.
 *
 * `arm` subscribes with `watchStrand` and records the first time each message's text
 * appears after a wake, so "seen" measures the watch path the chat screen relies on,
 * not a poll. Installed only when `__DEV__`.
 */
import { listStrands, listMessages, send, watchStrand, createInvitation, acceptInvitation, getPrefs, setPrefs } from '../data/adapter';
import { parseInviteToken } from '@chat/core';
import { cadreService } from '../host/CadreService';

type Bridge = {
  strands(): Promise<Array<{ id: string; title: string }>>;
  send(strandId: string, text: string): Promise<{ ms: number }>;
  arm(strandId: string): Promise<boolean>;
  seen(text: string): number | null;
  invite(): Promise<{ url: string; strandId: string | null }>;
  accept(url: string): Promise<{ strandId: string }>;
  traffic(seconds: number): Promise<Record<string, Record<string, number>>>;
  relays(addrs?: string[]): Promise<string[]>;
  start(id: string, method: 'strands' | 'send' | 'arm' | 'invite' | 'accept' | 'traffic' | 'relays', ...args: unknown[]): true;
  take(id: string): { ok: true; value: unknown } | { ok: false; error: string } | undefined;
};

type StreamLike = { id: string; protocol?: string; direction: string };
type ConnLike = { id: string; remotePeer: { toString(): string }; limits?: unknown; streams: StreamLike[] };
type NodeLike = { getConnections(): ConnLike[] };

/** Every libp2p node this party runs, labelled: the control node and one per live strand. */
function libp2pNodes(): Array<[string, NodeLike]> {
  // Dev-only reach past the service's boundary: the cadre node is private there.
  const cadre = (cadreService as unknown as { node?: { getControlNode(): NodeLike | null } }).node;
  const out: Array<[string, NodeLike]> = [];
  const control = cadre?.getControlNode();
  if (control) out.push(['control', control]);
  for (const [id, inst] of cadreService.getStrands()) {
    const node = (inst as { libp2pNode?: NodeLike }).libp2pNode;
    if (node) out.push([`strand-${id.slice(0, 8)}`, node]);
  }
  return out;
}

/**
 * Count the streams opened on every node over `seconds`, by sampling open streams every
 * 100 ms: what the idle traffic consists of. A stream that opens and closes between two
 * samples is missed, so counts are a floor. Keys are `<protocol> <in|out> <peer>`, the
 * peer shortened and marked `(relayed)` for a limited connection.
 */
async function sampleTraffic(seconds: number): Promise<Record<string, Record<string, number>>> {
  const seen = new Set<string>();
  const counts: Record<string, Record<string, number>> = {};
  const sample = () => {
    for (const [label, node] of libp2pNodes()) {
      for (const conn of node.getConnections()) {
        for (const st of conn.streams) {
          const key = `${label}/${conn.id}/${st.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const proto = (st.protocol ?? '(negotiating)').replace(/strand-[0-9a-f-]{36}/, 'strand-*').replace(/control-[0-9a-f-]{36}/, 'control-*');
          const peer = conn.remotePeer.toString().slice(-4) + (conn.limits ? ' (relayed)' : '');
          const k = `${proto} ${st.direction === 'inbound' ? 'in' : 'out'} ${peer}`;
          (counts[label] ??= {})[k] = ((counts[label] ??= {})[k] ?? 0) + 1;
        }
      }
    }
  };
  const timer = setInterval(sample, 100);
  sample();
  await new Promise(r => setTimeout(r, seconds * 1000));
  clearInterval(timer);
  return counts;
}

const results = new Map<string, { ok: true; value: unknown } | { ok: false; error: string }>();

const firstSeen = new Map<string, number>();
const armed = new Map<string, () => void>();

async function record(strandId: string): Promise<void> {
  const msgs = await listMessages(strandId);
  const now = Date.now();
  for (const m of msgs) if (!firstSeen.has(m.content)) firstSeen.set(m.content, now);
}

export function installDevBridge(): void {
  if (!__DEV__) return;
  const bridge: Bridge = {
    async strands() {
      return (await listStrands()).map(s => ({ id: s.id, title: s.title }));
    },
    async send(strandId, text) {
      const t0 = Date.now();
      await send(strandId, { content: text, replyToId: null });
      return { ms: Date.now() - t0 };
    },
    async arm(strandId) {
      if (armed.has(strandId)) return true;
      // Armed only once the strand can be read: the watch itself subscribes even
      // before a strand opens, so it says nothing about whether the strand is up.
      try { await record(strandId); } catch { return false; }
      const unwatch = await watchStrand(strandId, () => { void record(strandId).catch(() => {}); });
      if (!unwatch) return false;
      armed.set(strandId, unwatch);
      return true;
    },
    seen(text) {
      return firstSeen.get(text) ?? null;
    },
    async invite() {
      const inv = await createInvitation({ visibility: 'private', grantsInviteRight: false });
      return { url: inv.url, strandId: inv.strandId };
    },
    traffic(seconds) {
      return sampleTraffic(seconds);
    },
    async relays(addrs) {
      if (addrs) await setPrefs({ relayAddrs: addrs });
      return (await getPrefs()).relayAddrs;
    },
    async accept(url) {
      const token = parseInviteToken(url);
      if (!token) throw new Error('not an invitation link');
      return acceptInvitation(token);
    },
    start(id, method, ...args) {
      const call = (bridge[method] as (...a: unknown[]) => Promise<unknown>)(...args);
      call.then(value => { results.set(id, { ok: true, value }); },
        err => { results.set(id, { ok: false, error: err instanceof Error ? err.message : String(err) }); });
      return true;
    },
    take(id) {
      const r = results.get(id);
      if (r) results.delete(id);
      return r;
    },
  };
  (globalThis as unknown as { __chatDev: Bridge }).__chatDev = bridge;
}
