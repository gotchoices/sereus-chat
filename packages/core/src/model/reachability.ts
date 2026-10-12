export type Reachability = {
  /** Can anybody answer an invitation from this device right now? */
  reachable: boolean;
  /**
   * Not reachable, but a relay is chosen and still connecting. Must not be shown as
   * "nowhere to be reached": the user has just done what that screen asked of them.
   */
  relayPending: boolean;
};

export interface ReachabilityModel {
  get(): Promise<Reachability>;
}
