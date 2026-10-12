/**
 * The few host globals the core relies on, which every runtime it targets provides
 * (Hermes/React Native, browsers, Node, NativeScript). Declared here rather than pulling
 * in the DOM or Node type libraries, so a browser-only or Node-only API cannot slip
 * into the core unnoticed.
 */
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare function setInterval(handler: () => void, ms?: number): unknown;
declare function clearInterval(handle: unknown): void;

interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

interface Crypto {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID?(): string;
}
declare const crypto: Crypto;

declare const console: {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
