/**
 * Reachability: can anybody answer an invitation from this device. Defined in
 * `@serfab/cadre-client`, which counts the party's own always-on machines as well as this
 * device's relay reservation; re-exported here for the chat model's one import.
 */
export type { Reachability, ReachabilityModel, ReachabilityView, ReachedVia } from '@serfab/cadre-client';
