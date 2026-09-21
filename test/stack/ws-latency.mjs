/**
 * Inject outbound WebSocket latency into this Node process.
 *
 * The device evidence says a circuit dial that Node completes in milliseconds
 * takes 1.6 s to 39 s on the phone, and that FRET's announce then times out, so
 * the host never joins the joiner's ring and first sync has nobody to read from.
 * This module exists to test that story directly: if slowness alone is enough,
 * slowing Node down should reproduce the same failure with no device involved —
 * which is the reproduction an upstream report would need.
 *
 * WHERE IT HOOKS. `@libp2p/websockets` does `new WebSocket(uri)` against the
 * GLOBAL constructor (Node 22+ ships one), so replacing the global reaches every
 * outbound socket libp2p opens, and nothing else. That is also precisely the
 * surface React Native differs on, which is what makes it a fair model rather
 * than an arbitrary sleep.
 *
 * TWO MODES, because the first one I wrote was not what I thought it was.
 *
 *   latency (default) — each frame waits `WS_SEND_DELAY_MS` independently and they
 *     remain overlapped in flight, so a constant one-way delay shifts every frame
 *     by the same amount. This is what "network latency" means.
 *
 *   serial (`WS_SEND_DELAY_MODE=serial`) — frames are held on ONE promise chain,
 *     so frame k waits for the k-1 frames ahead of it to serve their delays first.
 *     The delay COMPOUNDS: this is an outbound frame-RATE cap of 1000/delay frames
 *     per second per socket, not latency.
 *
 * The distinction is not academic. This scenario pushes thousands of outbound
 * frames per socket during bring-up, so under `serial` a 10 ms setting costs a busy
 * socket tens of seconds — and that, not any property of the stack, produced the
 * "10 ms cliff" reported in gotchoices/sereus#13. Kept because upstream kept it
 * under the same name, so those numbers stay reproducible.
 *
 * It also reports a TRUTHFUL `bufferedAmount` (bytes queued here, not yet sent),
 * which leaves libp2p's backpressure working exactly as it does natively. That is
 * deliberate: the point is to vary latency alone, and the phone's missing
 * backpressure is a separate question already tested and set aside.
 *
 * Import for side effects BEFORE libp2p is constructed; a zero/absent delay makes
 * it a no-op and leaves the global untouched.
 */
const DELAY_MS = Number(process.env.WS_SEND_DELAY_MS ?? 0);

function byteLengthOf(data) {
  if (data == null) return 0;
  if (typeof data === 'string') return Buffer.byteLength(data);
  if (data.byteLength != null) return data.byteLength;
  return 0;
}

const MODE = process.env.WS_SEND_DELAY_MODE === 'serial' ? 'serial' : 'latency';
/**
 * Count outbound frames per socket even at zero delay (`WS_COUNT_FRAMES=1`).
 *
 * The count is the thing that makes a per-frame cost matter: multiply it by
 * whatever each frame costs on the link (or on a slow device's CPU) and you have
 * the bring-up budget. It is also what turned the `serial` mode above from "a
 * 10 ms delay" into tens of seconds.
 */
const COUNT_FRAMES = process.env.WS_COUNT_FRAMES === '1';

if (COUNT_FRAMES && typeof globalThis.WebSocket === 'function') {
  const Native = globalThis.WebSocket;
  const perSocket = [];
  class CountingWebSocket extends Native {
    #n = 0;
    constructor(...args) { super(...args); perSocket.push(() => this.#n); }
    send(data) { this.#n += 1; return Native.prototype.send.call(this, data); }
  }
  globalThis.WebSocket = CountingWebSocket;
  process.on('exit', () => {
    const counts = perSocket.map(f => f()).sort((a, b) => b - a);
    const total = counts.reduce((a, b) => a + b, 0);
    console.log(`[ws-latency] outbound frames: ${total} across ${counts.length} socket(s); busiest ${counts[0] ?? 0}`);
  });
}

if (DELAY_MS > 0 && typeof globalThis.WebSocket === 'function') {
  const Native = globalThis.WebSocket;

  class LatentWebSocket extends Native {
    #chain = Promise.resolve();
    #queued = 0;

    send(data) {
      const bytes = byteLengthOf(data);
      this.#queued += bytes;

      const flush = () => {
        try {
          Native.prototype.send.call(this, data);
        } catch {
          // The socket closed while this frame waited. Dropping matches what a
          // real link does; the connection is already failing by other means.
        } finally {
          this.#queued -= bytes;
        }
      };

      if (MODE === 'serial') {
        this.#chain = this.#chain
          .then(() => new Promise(resolve => setTimeout(resolve, DELAY_MS)))
          .then(flush);
        return;
      }

      // Independent timers of equal delay fire in the order they were scheduled,
      // so ordering is preserved without making the frames wait on each other.
      setTimeout(flush, DELAY_MS);
    }

    get bufferedAmount() {
      return this.#queued;
    }
  }

  globalThis.WebSocket = LatentWebSocket;
  console.log(`[ws-latency] mode=${MODE} outbound frames delayed ${DELAY_MS}ms`);
}
