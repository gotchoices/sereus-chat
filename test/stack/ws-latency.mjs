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
 * WHAT IT MODELS. Each outbound frame is held `WS_SEND_DELAY_MS` before reaching
 * the socket, in order. A handshake costing several round trips therefore costs
 * several multiples of the delay — the same shape as a slow dial, rather than one
 * artificial stall in the middle of an otherwise fast connection.
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

if (DELAY_MS > 0 && typeof globalThis.WebSocket === 'function') {
  const Native = globalThis.WebSocket;

  class LatentWebSocket extends Native {
    #chain = Promise.resolve();
    #queued = 0;

    send(data) {
      const bytes = byteLengthOf(data);
      this.#queued += bytes;
      // One chain per socket keeps frame ORDER intact. Sending out of order
      // would not model a slow link, it would model a broken one.
      this.#chain = this.#chain
        .then(() => new Promise(resolve => setTimeout(resolve, DELAY_MS)))
        .then(() => {
          try {
            Native.prototype.send.call(this, data);
          } catch {
            // The socket closed while this frame waited. Dropping matches what a
            // real link does; the connection is already failing by other means.
          } finally {
            this.#queued -= bytes;
          }
        });
    }

    get bufferedAmount() {
      return this.#queued;
    }
  }

  globalThis.WebSocket = LatentWebSocket;
  console.log(`[ws-latency] outbound frames delayed ${DELAY_MS}ms`);
}
