import { describe, expect, it } from 'vitest';
import { batchWebSocketSends } from './websocket-batching.js';

function fakeSocketClass() {
  class FakeSocket {
    sent: unknown[] = [];
    closed = false;
    send(data: unknown) { this.sent.push(data instanceof Uint8Array ? Array.from(data) : data); }
    close() { this.closed = true; }
  }
  return FakeSocket;
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe('batchWebSocketSends', () => {
  it('joins the binary sends of one turn into one message, in order', async () => {
    const S = fakeSocketClass();
    const native: number[] = [];
    batchWebSocketSends(S.prototype, n => native.push(n));
    const ws = new S();
    ws.send(new Uint8Array([1, 2]));
    ws.send(new Uint8Array([9, 3, 4, 9]).subarray(1, 3)); // a view: only its own bytes
    ws.send(new Uint8Array([5]).buffer);
    expect(ws.sent).toEqual([]);
    await tick();
    expect(ws.sent).toEqual([[1, 2, 3, 4, 5]]);
    expect(native).toEqual([5]);
  });

  it('copies at send time, so a reused buffer does not change what goes out', async () => {
    const S = fakeSocketClass();
    batchWebSocketSends(S.prototype);
    const ws = new S();
    const buf = new Uint8Array([1, 2]);
    ws.send(buf);
    buf[0] = 7;
    await tick();
    expect(ws.sent).toEqual([[1, 2]]);
  });

  it('sends what is waiting before a text send or a close', async () => {
    const S = fakeSocketClass();
    batchWebSocketSends(S.prototype);
    const ws = new S();
    ws.send(new Uint8Array([1]));
    ws.send('text');
    ws.send(new Uint8Array([2]));
    ws.close();
    expect(ws.sent).toEqual([[1], 'text', [2]]);
    expect(ws.closed).toBe(true);
    await tick();
    expect(ws.sent).toEqual([[1], 'text', [2]]);
  });

  it('keeps sockets apart, and installs once', async () => {
    const S = fakeSocketClass();
    const native: number[] = [];
    batchWebSocketSends(S.prototype, n => native.push(n));
    batchWebSocketSends(S.prototype, n => native.push(n * 100));
    const a = new S(), b = new S();
    a.send(new Uint8Array([1]));
    b.send(new Uint8Array([2]));
    a.send(new Uint8Array([3]));
    await tick();
    expect(a.sent).toEqual([[1, 3]]);
    expect(b.sent).toEqual([[2]]);
    expect(native).toEqual([2, 1]);
  });
});
