/**
 * Every name this app files data under is a persistence contract: renaming one orphans
 * every installed device's data, with no error. This test fails on any change, so a
 * rename is a decision made together with a `DATA_FORMAT` bump, not an accident.
 */
// data-format.ts reads AsyncStorage, whose native module Jest does not have.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { NODE_STORAGE_NAMES, STORAGE_KEY_PREFIX, STORAGE_KEYS } from '../src/data/persisted-names';
import { DATA_FORMAT } from '../src/data/data-format';

describe('persisted names', () => {
  it('keeps the AsyncStorage keys', () => {
    expect({
      ...STORAGE_KEYS,
      draft: STORAGE_KEYS.draft('S'),
      readCursor: STORAGE_KEYS.readCursor('S'),
    }).toEqual({
      profile: '@sereus.chat/profile',
      prefs: '@sereus.chat/prefs',
      strandPrefs: '@sereus.chat/strandPrefs',
      strandSummaries: '@sereus.chat/strandSummaries',
      joinedStrands: '@sereus.chat/joinedStrands',
      outgoingInvitations: '@sereus.chat/outgoingInvitations',
      dataFormat: '@sereus.chat/dataFormat',
      themeMode: '@sereus.chat/themeMode',
      draft: '@sereus.chat/draft/S',
      readCursor: '@sereus.chat/read/S',
    });
    expect(STORAGE_KEY_PREFIX).toBe('@sereus.chat/');
  });

  it("keeps the cadre kit's storage names", () => {
    expect(NODE_STORAGE_NAMES).toEqual({
      storagePrefix: 'chat-',
      nodeLocalDb: 'chat-node-local',
      nodeLocalKvPrefix: 'chat:node-local:',
      savedStartKey: 'start-options',
    });
  });

  it('names the data format these were introduced with', () => {
    // Bump together with any change above.
    expect(DATA_FORMAT).toBe('sereus-1.15');
  });
});
