import { describe, expect, it } from 'vitest';
import { appOutdatedOf, toChatError } from './errors.js';

/** Sereus 1.24's refusal of an app older than a strand's schema, as cadre-core builds it. */
function outdated(): Error {
  const e = Object.assign(new Error('app schema version 5 is older than the strand\'s 6'), { appSchemaVersion: 5, strandSchemaVersion: 6 });
  e.name = 'AppSchemaOutdatedError';
  return e;
}

describe('an app older than the strand (sereus 1.24)', () => {
  it('is app-outdated, final, found through wrapping errors', () => {
    const wrapped = new Error('strand launch failed', { cause: new Error('apply failed', { cause: outdated() }) });
    expect(appOutdatedOf(wrapped)?.strandSchemaVersion).toBe(6);
    const err = toChatError(wrapped);
    expect(err.kind).toBe('app-outdated');
    expect(err.retryable).toBe(false);
  });

  it('leaves other failures alone', () => {
    expect(appOutdatedOf(new Error('something else'))).toBeUndefined();
    expect(toChatError(new Error('something else')).kind).toBe('unexpected');
  });
});
