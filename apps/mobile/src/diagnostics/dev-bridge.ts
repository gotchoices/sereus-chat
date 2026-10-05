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
 *
 * Hermes's inspector ignores `awaitPromise`, so an async call is started with
 * `__chatDev.start(id, method, ...args)` and its outcome collected later with
 * `__chatDev.take(id)` → undefined while pending, then { ok, value } or { ok: false, error }.
 *
 * `arm` subscribes with `watchStrand` and records the first time each message's text
 * appears after a wake, so "seen" measures the watch path the chat screen relies on,
 * not a poll. Installed only when `__DEV__`.
 */
import { listStrands, listMessages, send, watchStrand, createInvitation, acceptInvitation } from '../data/adapter';
import { parseInviteToken } from '../data/inviteLink';

type Bridge = {
  strands(): Promise<Array<{ id: string; title: string }>>;
  send(strandId: string, text: string): Promise<{ ms: number }>;
  arm(strandId: string): Promise<boolean>;
  seen(text: string): number | null;
  invite(): Promise<{ url: string; strandId: string | null }>;
  accept(url: string): Promise<{ strandId: string }>;
  start(id: string, method: 'strands' | 'send' | 'arm' | 'invite' | 'accept', ...args: unknown[]): true;
  take(id: string): { ok: true; value: unknown } | { ok: false; error: string } | undefined;
};

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
      await record(strandId).catch(() => {});
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
