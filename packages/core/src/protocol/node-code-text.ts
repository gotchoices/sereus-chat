/**
 * Node codes as text (`sereus-join:`): plain string handling, so a scanner can tell a
 * node code from an invitation without loading the stack. Defined in `@chat/cadre-client`
 * and re-exported here, where the chat app's screens already look for it.
 */
export { NODE_CODE_SCHEME, isNodeCode, nodeCodeFromUrl } from '@chat/cadre-client';
