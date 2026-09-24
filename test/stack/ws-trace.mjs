/**
 * Who opens and who closes each WebSocket, with the stack that did it.
 *
 * We can see that a failing run opens 23 sockets where a healthy one opens 4, but
 * not WHY. The two candidate stories need different fixes:
 *
 *   the old connection died   -> find what closed it (us? the peer? the transport?)
 *   the old one was fine      -> find what dialled again anyway
 *
 * A stack captured in the `close` EVENT is useless — it unwinds to the event loop.
 * So `close()` is wrapped to capture the stack of whoever CALLED it, and the event
 * handler then reports `LOCAL` (we closed it, with that stack) or `REMOTE` (it
 * closed under us, so the peer or the transport did it). That distinction is the
 * whole point.
 *
 * Construction is traced too: a new socket with no preceding close for its
 * predecessor is the second story, and says so.
 *
 * Usage:  WS_TRACE=1 node two-party-formation.mjs
 */
const TRACING = process.env.WS_TRACE === '1';

/** A few useful frames: drop node internals and this file, keep the callers. */
function callerFrames(err, limit = 4) {
  return (err.stack ?? '')
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => !l.includes('node:internal') && !l.includes('ws-trace.mjs'))
    .slice(0, limit)
    .map(l => l.replace(process.cwd() + '/', '').replace(/^at /, ''))
    .join(' <- ');
}

if (TRACING && typeof globalThis.WebSocket === 'function') {
  const Native = globalThis.WebSocket;
  let counter = 0;
  const started = Date.now();
  const at = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  const open = new Set();

  class TracedWebSocket extends Native {
    #id = ++counter;
    #localClose = null;

    constructor(...args) {
      super(...args);
      const id = this.#id;
      open.add(id);
      console.log(`[ws-trace ${at()}] OPEN #${id} (live=${open.size}) <- ${callerFrames(new Error())}`);

      this.addEventListener('close', (ev) => {
        open.delete(id);
        const who = this.#localClose ? 'LOCAL' : 'REMOTE';
        const detail = this.#localClose ? ` <- ${this.#localClose}` : '';
        console.log(`[ws-trace ${at()}] CLOSE #${id} ${who} code=${ev?.code ?? '?'} reason="${ev?.reason ?? ''}" (live=${open.size})${detail}`);
      });
      this.addEventListener('error', () => {
        console.log(`[ws-trace ${at()}] ERROR #${id}`);
      });
    }

    close(...args) {
      // The caller's stack, captured BEFORE the async close event.
      this.#localClose = callerFrames(new Error());
      return Native.prototype.close.apply(this, args);
    }
  }

  globalThis.WebSocket = TracedWebSocket;
  console.log('[ws-trace] tracing socket open/close');
}
