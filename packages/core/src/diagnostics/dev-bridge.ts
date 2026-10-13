/**
 * The development bridge: hooks for driving any chat app from a test script, with no UI in
 * between. Each app installs it as `globalThis.__chatDev` in development builds; the
 * `test/devices` tools reach it over an inspector (`Runtime.evaluate`) — Metro's for a
 * phone, Node's for serchat — so one script drives a phone and serchat alike.
 *
 *   strands()             → [{ id, title }]
 *   send(strandId, text)  → { ms }      the same `send` a composer calls
 *   arm(strandId)         → true        watch it, as a chat view does
 *   seen(text)            → epoch ms when first seen here, or null
 *   invite()              → { url, strandId }   a new private strand's invitation
 *   accept(url)           → { strandId }        join through it
 *   traffic(seconds)      → new streams per node, protocol and direction
 *   relays([addrs])       → the relays; with addrs, set them first
 *
 * Hermes's inspector ignores `awaitPromise`, so an async call is started with
 * `start(id, method, ...args)` and its outcome collected later with `take(id)` →
 * undefined while pending, then { ok, value } or { ok: false, error }.
 *
 * `arm` subscribes with `changes.strand` and records the first time each message's text
 * appears, so `seen` measures the watch path a chat view relies on, not a poll.
 */
import { parseInviteToken } from '../protocol/index.js';
import type { ChatModel, Result } from '../model/index.js';
import type { NodeHost } from '../sereus/host.js';

export type DevBridgeMethod = 'strands' | 'send' | 'arm' | 'seen' | 'invite' | 'accept' | 'traffic' | 'relays';

export interface DevBridge {
  strands(): Promise<Array<{ id: string; title: string }>>;
  send(strandId: string, text: string): Promise<{ ms: number }>;
  arm(strandId: string): Promise<boolean>;
  seen(text: string): number | null;
  invite(): Promise<{ url: string; strandId: string | null }>;
  accept(url: string): Promise<{ strandId: string }>;
  traffic(seconds: number): Promise<Record<string, Record<string, number>>>;
  relays(addrs?: string[]): Promise<string[]>;
  start(id: string, method: DevBridgeMethod, ...args: unknown[]): true;
  take(id: string): { ok: true; value: unknown } | { ok: false; error: string } | undefined;
}

type StreamLike = { id: string; protocol?: string; direction: string };
type ConnLike = { id: string; remotePeer: { toString(): string }; limits?: unknown; streams: StreamLike[] };
type NodeLike = { getConnections(): ConnLike[] };

function value<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new Error(`${result.error.kind}: ${result.error.message}`);
}

/** Every libp2p node this party runs, labelled: the control node and one per live strand. */
function libp2pNodes(host: NodeHost | undefined): Array<[string, NodeLike]> {
  const cadre = host?.node;
  if (!cadre) return [];
  const out: Array<[string, NodeLike]> = [];
  const control = cadre.getControlNode() as unknown as NodeLike | null;
  if (control) out.push(['control', control]);
  for (const [id, inst] of cadre.getStrands()) {
    const node = (inst as { libp2pNode?: NodeLike }).libp2pNode;
    if (node) out.push([`strand-${id.slice(0, 8)}`, node]);
  }
  return out;
}

/**
 * Count the streams opened on every node over `seconds`, by sampling open streams every
 * 100 ms. A stream that opens and closes between two samples is missed, so counts are a
 * floor. Keys are `<protocol> <in|out> <peer>`, the peer shortened and marked
 * `(relayed)` for a limited connection.
 */
async function sampleTraffic(host: NodeHost | undefined, seconds: number): Promise<Record<string, Record<string, number>>> {
  const seen = new Set<string>();
  const counts: Record<string, Record<string, number>> = {};
  const sample = () => {
    for (const [label, node] of libp2pNodes(host)) {
      for (const conn of node.getConnections()) {
        for (const st of conn.streams) {
          const key = `${label}/${conn.id}/${st.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const proto = (st.protocol ?? '(negotiating)').replace(/strand-[0-9a-f-]{36}/, 'strand-*').replace(/control-[0-9a-f-]{36}/, 'control-*');
          const peer = conn.remotePeer.toString().slice(-4) + (conn.limits ? ' (relayed)' : '');
          const k = `${proto} ${st.direction === 'inbound' ? 'in' : 'out'} ${peer}`;
          const byLabel = (counts[label] ??= {});
          byLabel[k] = (byLabel[k] ?? 0) + 1;
        }
      }
    }
  };
  const timer = setInterval(sample, 100);
  sample();
  await new Promise<void>(r => setTimeout(() => r(), seconds * 1000));
  clearInterval(timer);
  return counts;
}

/** The bridge over a model; `host` (the Sereus model's node host) adds `traffic`. */
export function createDevBridge(model: ChatModel, host?: NodeHost): DevBridge {
  const results = new Map<string, { ok: true; value: unknown } | { ok: false; error: string }>();
  const firstSeen = new Map<string, number>();
  const armed = new Map<string, () => void>();

  async function record(strandId: string): Promise<void> {
    const msgs = value(await model.messages.list(strandId));
    const now = Date.now();
    for (const m of msgs) if (!firstSeen.has(m.content)) firstSeen.set(m.content, now);
  }

  const bridge: DevBridge = {
    async strands() {
      return value(await model.strands.list()).map(s => ({ id: s.id, title: s.title }));
    },
    async send(strandId, text) {
      const t0 = Date.now();
      value(await model.messages.send(strandId, { content: text, replyToId: null }));
      return { ms: Date.now() - t0 };
    },
    async arm(strandId) {
      if (armed.has(strandId)) return true;
      // Armed only once the strand can be read: the watch itself subscribes even before a
      // strand opens, so it says nothing about whether the strand is up.
      try { await record(strandId); } catch { return false; }
      const unwatch = model.changes.strand(strandId, () => { void record(strandId).catch(() => {}); });
      armed.set(strandId, unwatch);
      return true;
    },
    seen(text) {
      return firstSeen.get(text) ?? null;
    },
    async invite() {
      const inv = value(await model.invitations.create({ visibility: 'private', grantsInviteRight: false }));
      return { url: inv.url, strandId: inv.strandId };
    },
    traffic(seconds) {
      return sampleTraffic(host, seconds);
    },
    async relays(addrs) {
      if (addrs) value(await model.prefs.set({ relayAddrs: addrs }));
      return value(await model.prefs.get()).relayAddrs;
    },
    async accept(url) {
      const token = parseInviteToken(url);
      if (!token) throw new Error('not an invitation link');
      return value(await model.invitations.accept(token));
    },
    start(id, method, ...args) {
      // Some methods answer at once (`seen`): a plain value is a result like any other.
      const call = Promise.resolve().then(() => (bridge[method] as (...a: unknown[]) => unknown)(...args));
      call.then(v => { results.set(id, { ok: true, value: v }); },
        err => { results.set(id, { ok: false, error: err instanceof Error ? err.message : String(err) }); });
      return true;
    },
    take(id) {
      const r = results.get(id);
      if (r) results.delete(id);
      return r;
    },
  };
  return bridge;
}
