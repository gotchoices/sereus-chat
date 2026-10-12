export type Reachability = {
  /** Can anybody answer an invitation from this device right now? */
  reachable: boolean;
  /**
   * Not reachable, but a relay is chosen and still connecting. Must not be shown as
   * "nowhere to be reached": the user has just done what that screen asked of them.
   */
  relayPending: boolean;
  /** The relays this device is configured with. */
  relays: string[];
  /**
   * The relay reservation, read live: a configured relay is not a working one. `null`
   * when there is no node (the mock, or before start).
   */
  relayStatus: 'none' | 'dialing' | 'reserved' | 'failed' | (string & {}) | null;
};

export interface ReachabilityModel {
  get(): Promise<Reachability>;
}
