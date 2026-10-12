/**
 * keychain.ts — the cadre kit's `SecureStoreApi` over `react-native-keychain`: the iOS
 * Keychain and Android Keystore-backed storage, one keychain service per key.
 *
 * The kit's `SecureStoreKeyStore` sits on it, so the node's identity, its trusted-owner
 * anchor and the strands this party joined live in the platform's secure store rather
 * than in an app database.
 *
 * The contract the kit relies on: `null` for an absent key, a throw for a read that
 * failed — never `null` for a failure, which would let a caller mint a replacement over
 * a real key. (Same adapter as Taleus's.)
 */
import * as Keychain from 'react-native-keychain';
import type { SecureStoreApi, SecureStoreOptions } from '@serfab/cadre-rn/key-store';

/** The account every entry is filed under; the service is what tells entries apart. */
const ACCOUNT = 'sereus-chat';

/**
 * Readable after the first unlock since boot, so a background start can read the
 * identity while the device is locked. The kit's `keychainAccessible` constants are
 * Expo's, so this adapter fixes the class rather than translating them.
 */
const ACCESSIBLE = Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK;

function refuseGated(options: SecureStoreOptions | undefined): void {
  if (options?.requireAuthentication) {
    throw new Error('the keychain adapter does not gate entries behind authentication');
  }
}

export const keychainSecureStore: SecureStoreApi = {
  async getItemAsync(key, options) {
    refuseGated(options);
    const found = await Keychain.getGenericPassword({ service: key });
    return found ? found.password : null;
  },
  async setItemAsync(key, value, options) {
    refuseGated(options);
    await Keychain.setGenericPassword(ACCOUNT, value, { service: key, accessible: ACCESSIBLE });
  },
  async deleteItemAsync(key) {
    await Keychain.resetGenericPassword({ service: key });
  },
};
