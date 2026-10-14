/**
 * Polyfills chat needs beyond sereus's reference-app-ns set (the other files here, copied
 * as they are). Imported last by the barrel.
 *
 * queueMicrotask — absent on NativeScript's V8. libp2p's relay dialling (circuit-relay-v2
 * as of the 1.15 stack) calls it, and without it no relay reservation is ever made
 * ("queueMicrotask is not defined"). Worth adding to reference-app-ns upstream.
 */
const g = globalThis as { queueMicrotask?: (cb: () => void) => void };
if (typeof g.queueMicrotask !== 'function') {
  g.queueMicrotask = (cb: () => void) => {
    Promise.resolve().then(cb).catch(err => setTimeout(() => { throw err; }, 0));
  };
}



/**
 * TextDecoder and views into larger buffers. @nativescript/core's TextDecoder decodes
 * `input.buffer` for a view, ignoring its offset and length (NativeScript/NativeScript#9941,
 * where we posted the root cause). libp2p's multistream-select decodes
 * protocol names from sub-arrays (views with a non-zero byteOffset into a larger
 * buffer). If the runtime's decoder reads from the start of the underlying buffer instead
 * of the view, every protocol negotiation fails ("did not read multistream-select header",
 * "na" for an empty protocol). Checked at startup; copied views are a correct, cheap fix.
 */
function textDecoderHonoursOffsets(): boolean {
  const bytes = new Uint8Array([0x78, 0x78, 0x68, 0x69]); // "xxhi"
  return new TextDecoder().decode(bytes.subarray(2)) === 'hi';
}
const decoderOk = typeof TextDecoder === 'function' && textDecoderHonoursOffsets();
if (typeof TextDecoder === 'function' && !decoderOk) {
  const original = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
    if (input && ArrayBuffer.isView(input) && (input.byteOffset !== 0 || input.byteLength !== input.buffer.byteLength)) {
      input = new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    }
    return original.call(this, input as never, options);
  };
}
console.log(`[polyfill] TextDecoder honours view offsets: ${decoderOk}${decoderOk ? '' : ' — patched to copy views'}`);

/**
 * WebSocket sends, batched. libp2p's WebSocket connection sends each chunk of a write as
 * its own message (`sendData` loops `websocket.send(buf)`); about half are ≤16 bytes
 * (length prefixes, frame headers). Each send here crosses from JS into Java, at a fixed
 * cost of about 0.5 ms on the S7 whatever its size. libp2p reads a WebSocket as a byte
 * stream, so message boundaries carry nothing: binary sends made in one turn are joined
 * and sent once, in a microtask, in order. A text send or `close()` sends what is waiting
 * first.
 */
type Sendable = ArrayBuffer | ArrayBufferView;
const wsProto = (globalThis as { WebSocket?: { prototype: { send(d: unknown): void; close(...a: unknown[]): void } } }).WebSocket?.prototype;
// Native sends, counted for test/devices tools (cheap; read as `__wsNative`).
const wsNative = ((globalThis as { __wsNative?: { sends: number; bytes: number } }).__wsNative = { sends: 0, bytes: 0 });
/** Off only to measure what batching saves. */
const BATCH_WS_SENDS = true;
if (wsProto) {
  const nativeSend = wsProto.send;
  const send = function (this: object, d: unknown) {
    wsNative.sends++;
    wsNative.bytes += (d as { byteLength?: number })?.byteLength ?? (d as string)?.length ?? 0;
    return nativeSend.call(this, d);
  };
  wsProto.send = send;
  if (BATCH_WS_SENDS) batchSends(wsProto, send);
}

function batchSends(wsProto: { send(d: unknown): void; close(...a: unknown[]): void }, send: (this: object, d: unknown) => void) {
  const close = wsProto.close;
  const waiting = new WeakMap<object, Uint8Array[]>();
  const flush = (ws: object) => {
    const parts = waiting.get(ws);
    if (!parts) return;
    waiting.delete(ws);
    if (parts.length === 1) return send.call(ws, parts[0]);
    let size = 0;
    for (const p of parts) size += p.byteLength;
    const joined = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { joined.set(p, at); at += p.byteLength; }
    send.call(ws, joined);
  };
  wsProto.send = function (this: object, data: unknown) {
    if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      flush(this);
      return send.call(this, data);
    }
    const d = data as Sendable;
    // A copy: the caller may reuse its buffer once send() returns.
    const bytes = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
    let parts = waiting.get(this);
    if (!parts) {
      waiting.set(this, (parts = []));
      queueMicrotask(() => flush(this));
    }
    parts.push(bytes);
  };
  wsProto.close = function (this: object, ...args: unknown[]) {
    flush(this);
    return close.apply(this, args);
  };
}
