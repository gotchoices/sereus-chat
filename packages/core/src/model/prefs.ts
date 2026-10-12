import type { Result } from './result.js';

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  language: string;
  notifyDefault: 'all' | 'mentions' | 'none';
  storageCeilingBytes: number | null;
  perStrandOverrides: number;
  /**
   * Relays this device borrows to be reachable. Device-local, never strand data.
   * Moves to `reachability` in Phase 5, where the node's start options hold them.
   */
  relayAddrs: string[];
};

export interface PrefsModel {
  get(): Promise<Result<Prefs>>;
  /** Merges the patch and returns the result. */
  set(patch: Partial<Prefs>): Promise<Result<Prefs>>;
}
