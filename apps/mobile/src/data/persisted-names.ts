/**
 * persisted-names.ts — every name this app files data under, in one place.
 *
 * Each is a persistence contract: renaming one orphans every installed device's data,
 * silently. `__tests__/persisted-names.test.ts` pins them, so a rename fails the test
 * instead of reaching a phone. Change one only together with a `DATA_FORMAT` bump.
 *
 * In the app-family structure (docs/app-family.md) the AsyncStorage keys become the
 * core's named slots, and this map is what the app's host uses to place them.
 */
/** AsyncStorage keys. */
export const STORAGE_KEYS = {
  profile: '@sereus.chat/profile',
  prefs: '@sereus.chat/prefs',
  strandPrefs: '@sereus.chat/strandPrefs',
  strandSummaries: '@sereus.chat/strandSummaries',
  joinedStrands: '@sereus.chat/joinedStrands',
  outgoingInvitations: '@sereus.chat/outgoingInvitations',
  dataFormat: '@sereus.chat/dataFormat',
  themeMode: '@sereus.chat/themeMode',
  draft: (strandId: string) => `@sereus.chat/draft/${strandId}`,
  readCursor: (strandId: string) => `@sereus.chat/read/${strandId}`,
} as const;

/** The prefix every AsyncStorage key above shares. */
export const STORAGE_KEY_PREFIX = '@sereus.chat/';

/**
 * The cadre kit's storage names (`createPhoneNode({ names })`): LevelDB databases and the
 * key prefix inside the node-local one. The node's identity, trusted-owner anchor and
 * joined strands are in the keychain, under keys the kit derives from the party id.
 */
// Checked against the kit's `PhoneNodeNames` where `CadreService` passes it in.
export const NODE_STORAGE_NAMES = {
  storagePrefix: 'chat-',
  nodeLocalDb: 'chat-node-local',
  nodeLocalKvPrefix: 'chat:node-local:',
  savedStartKey: 'start-options',
} as const;
