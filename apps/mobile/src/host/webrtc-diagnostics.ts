/**
 * webrtc-diagnostics.ts — `[ice]` log lines for every WebRTC peer connection (the ones libp2p's
 * WebRTC transport makes included): which candidates each side offers (host = a LAN address,
 * srflx = a public address learned through STUN, relay = TURN), how ICE progresses, and on
 * success or failure which candidate pair it used. Says whether a direct connection failed for
 * want of STUN, of a hole punch, or of anything at all. Addresses are not logged, only kinds.
 *
 * Installed once, when `WEBRTC` is on (CadreService). Wraps `dispatchEvent` on
 * react-native-webrtc's RTCPeerConnection and `addIceCandidate`, both on the prototype.
 */
import { RTCPeerConnection } from 'react-native-webrtc';

type Candidate = { candidate?: string } | null | undefined;
type Pc = {
  iceConnectionState: string;
  getStats(): Promise<Map<string, Record<string, unknown>>>;
};

let installed = false;
/** The NAT check's own peer connection, kept out of the `[ice]` lines. */
const quiet = new WeakSet<object>();
let nextId = 0;
const ids = new WeakMap<object, number>();
const idOf = (pc: object) => ids.get(pc) ?? (ids.set(pc, ++nextId), nextId);

/** "host udp v4 private" from an SDP candidate line, without the address. */
function describe(c: Candidate): string {
  const line = c?.candidate ?? '';
  if (!line) return 'end-of-candidates';
  const f = line.replace(/^candidate:/, '').split(' ');
  // foundation component protocol priority address port "typ" type …
  const [, , proto, , addr] = f;
  const type = f[f.indexOf('typ') + 1] ?? '?';
  const family = addr?.includes(':') ? 'v6' : addr?.endsWith('.local') ? 'mdns' : 'v4';
  const scope = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|fe80:|fd|fc)/i.test(addr ?? '') ? ' private' : '';
  return `${type} ${proto?.toLowerCase()} ${family}${scope}`;
}

async function selectedPair(pc: Pc): Promise<string> {
  try {
    const stats = await pc.getStats();
    const all = [...stats.values()];
    const pairs = all.filter(s => s.type === 'candidate-pair');
    const pair = pairs.find(p => p.nominated && p.state === 'succeeded') ?? pairs.find(p => p.state === 'succeeded');
    const kinds = pairs.reduce<Record<string, number>>((acc, p) => { acc[String(p.state)] = (acc[String(p.state)] ?? 0) + 1; return acc; }, {});
    const summary = `pairs ${JSON.stringify(kinds)}`;
    if (!pair) return `no working pair; ${summary}`;
    const cand = (id: unknown) => all.find(s => s.id === id);
    const l = cand(pair.localCandidateId), r = cand(pair.remoteCandidateId);
    return `using local ${String(l?.candidateType)} ${String(l?.protocol)} ↔ remote ${String(r?.candidateType)} ${String(r?.protocol)}; ${summary}`;
  } catch (err) {
    return `stats unavailable (${err instanceof Error ? err.message : String(err)})`;
  }
}

export function installWebRTCDiagnostics(): void {
  if (installed) return;
  installed = true;
  const proto = RTCPeerConnection.prototype as unknown as {
    dispatchEvent(ev: { type: string; candidate?: Candidate }): boolean;
    addIceCandidate(c: Candidate): Promise<void>;
  };
  const dispatch = proto.dispatchEvent;
  proto.dispatchEvent = function (this: Pc, ev) {
    if (quiet.has(this)) return dispatch.call(this, ev);
    const id = idOf(this);
    if (ev.type === 'icecandidate') {
      console.info(`[ice] pc${id} local ${describe(ev.candidate)}`);
    } else if (ev.type === 'iceconnectionstatechange') {
      const state = this.iceConnectionState;
      console.info(`[ice] pc${id} ${state}`);
      if (state === 'connected' || state === 'failed') {
        void selectedPair(this).then(s => console.info(`[ice] pc${id} ${state}: ${s}`));
      }
    }
    return dispatch.call(this, ev);
  };
  // Who closes a peer connection: its caller's stack, a few frames, decoded afterwards with
  // the build's source map (metro-symbolicate). Connections were closing 20–80 s after
  // connecting (2026-11-14), and nothing in the logs said why.
  const close = (proto as unknown as { close(): void }).close;
  (proto as unknown as { close(): void }).close = function (this: Pc) {
    if (!quiet.has(this)) {
      const frames = (new Error().stack ?? '').split('\n').slice(2, 12).map(f => f.trim()).join(' | ');
      console.info(`[ice] pc${idOf(this)} close called (state ${this.iceConnectionState}) from: ${frames}`);
    }
    return close.call(this);
  };
  const add = proto.addIceCandidate;
  proto.addIceCandidate = function (this: Pc, c) {
    console.info(`[ice] pc${idOf(this)} remote ${describe(c)}`);
    return add.call(this, c);
  };
}

/** Public STUN servers beside the relays' own, for the NAT check only. */
const EXTRA_STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];

/**
 * Logs this network's NAT mapping, the thing that decides whether a hole punch can work: one
 * local socket asks several STUN servers for its public address. The same public port from
 * all of them is a cone (endpoint-independent) NAT, which punches; a different port per
 * server is a symmetric NAT, which punches only against a lenient partner, and otherwise
 * needs TURN. No addresses are logged.
 */
export async function logNatMapping(stun: Array<{ urls: string | string[] }>): Promise<void> {
  const urls = [...stun.flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls])), ...EXTRA_STUN];
  // One server per entry, so each answers for itself.
  const pc = new RTCPeerConnection({ iceServers: urls.map(u => ({ urls: u })) }) as unknown as {
    createDataChannel(label: string): unknown;
    createOffer(): Promise<unknown>;
    setLocalDescription(d: unknown): Promise<void>;
    addEventListener(type: string, fn: (ev: { candidate?: Candidate }) => void): void;
    close(): void;
  };
  quiet.add(pc);
  const byBase = new Map<string, Set<string>>();   // local socket → public ip:port seen
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 8000);
      pc.addEventListener('icecandidate', (ev) => {
        const line = ev.candidate?.candidate;
        if (!line) { clearTimeout(timer); resolve(); return; }
        const f = line.replace(/^candidate:/, '').split(' ');
        if (f[f.indexOf('typ') + 1] !== 'srflx' || f[2]?.toLowerCase() !== 'udp') return;
        const base = `${f[f.indexOf('raddr') + 1]}:${f[f.indexOf('rport') + 1]}`;
        const set = byBase.get(base) ?? byBase.set(base, new Set()).get(base)!;
        set.add(`${f[4]}:${f[5]}`);
      });
      pc.createDataChannel('nat-check');
      void pc.createOffer().then(o => pc.setLocalDescription(o));
    });
  } finally {
    pc.close();
  }
  const sockets = [...byBase.values()];
  const most = Math.max(0, ...sockets.map(s => s.size));
  const verdict = !sockets.length ? 'no STUN answers (UDP blocked?)'
    : most > 1 ? `SYMMETRIC: one local socket got ${most} different public addresses from ${urls.length} STUN servers`
    : `cone (endpoint-independent): each local socket got one public address (${sockets.length} socket(s), ${urls.length} STUN servers)`;
  console.info(`[ice] NAT mapping: ${verdict}`);
}
