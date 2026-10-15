/**
 * WebSocket sends, batched.
 *
 * libp2p's WebSocket connection sends each chunk of a write as its own message
 * (`@libp2p/websockets` `sendData` loops `websocket.send(buf)`); about half are ≤16 bytes
 * (Noise length prefixes, yamux headers). On a phone every message costs a crossing into
 * native code: ~0.5 ms on a Galaxy S7 under NativeScript, and a base64-encoded
 * `sendBinary` call under React Native. libp2p reads a WebSocket as a byte stream, so
 * message boundaries carry nothing: binary sends made in one turn are joined and sent once,
 * in a microtask, in order. A text send, or `close()`, sends what is waiting first.
 *
 * Measured on the S7 (NativeScript): 62% fewer native sends, while joining and while idle.
 */
export interface WebSocketPrototype {
  send(data: unknown): void;
  close(...args: unknown[]): void;
}

const INSTALLED = Symbol.for('chat.websocket-batching');

/**
 * Wrap `proto.send` and `proto.close` (normally `WebSocket.prototype`). Idempotent.
 * `onNativeSend`, if given, is told the size of each message that really goes out.
 */
export function batchWebSocketSends(proto: WebSocketPrototype, onNativeSend?: (bytes: number) => void): void {
  const marked = proto as WebSocketPrototype & { [INSTALLED]?: true };
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;
  const nativeSend = proto.send;
  const nativeClose = proto.close;
  const send = (ws: object, data: unknown) => {
    onNativeSend?.((data as { byteLength?: number })?.byteLength ?? (data as string)?.length ?? 0);
    nativeSend.call(ws, data);
  };
  const waiting = new WeakMap<object, Uint8Array[]>();
  const flush = (ws: object) => {
    const parts = waiting.get(ws);
    if (!parts) return;
    waiting.delete(ws);
    if (parts.length === 1) return send(ws, parts[0]);
    let size = 0;
    for (const p of parts) size += p.byteLength;
    const joined = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { joined.set(p, at); at += p.byteLength; }
    send(ws, joined);
  };
  proto.send = function (this: object, data: unknown) {
    if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      flush(this);
      return send(this, data);
    }
    // A copy: the caller may reuse its buffer once send() returns.
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data.slice(0))
      : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    let parts = waiting.get(this);
    if (!parts) {
      waiting.set(this, (parts = []));
      void Promise.resolve().then(() => flush(this));
    }
    parts.push(bytes);
  };
  proto.close = function (this: object, ...args: unknown[]) {
    flush(this);
    return nativeClose.apply(this, args);
  };
}
