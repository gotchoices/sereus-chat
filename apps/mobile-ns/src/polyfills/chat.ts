/**
 * Polyfills chat needs beyond sereus's reference-app-ns set (the other files here, copied
 * as they are). Imported last by the barrel.
 *
 * queueMicrotask — absent on NativeScript's V8. libp2p's relay dialling (circuit-relay-v2
 * as of the 1.15 stack) calls it, and without it no relay reservation is ever made
 * ("queueMicrotask is not defined"). Worth adding to reference-app-ns upstream.
 */
import { batchWebSocketSends, type WebSocketPrototype } from '@chat/core/transport';

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
 * WebSocket sends, batched (`@chat/core/transport`): libp2p sends each chunk of a write as
 * its own message, and each message crosses into Java here at ~0.5 ms on the S7. Native
 * sends are counted for test/devices tools (`__wsNative`).
 */

const wsNative = ((globalThis as { __wsNative?: { sends: number; bytes: number } }).__wsNative = { sends: 0, bytes: 0 });
const wsProto = (globalThis as { WebSocket?: { prototype: WebSocketPrototype } }).WebSocket?.prototype;
if (wsProto) batchWebSocketSends(wsProto, bytes => { wsNative.sends++; wsNative.bytes += bytes; });
