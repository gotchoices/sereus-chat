/**
 * data-format.ts — refuse to run over saved data an earlier build wrote in a form
 * this build cannot use.
 *
 * WHY. Sereus releases have changed what a node keeps on disk in ways that are
 * not carried over: 1.8 renamed and reshaped the control database ("recreate
 * every party"), and 1.9 stopped reading the strand peer book, so two phones that
 * upgraded together from 1.8 could never find each other again (seen on devices
 * 2026-10-01; draft upstream issue in apps/mobile/tmp). Neither release detects
 * old data — one crashed with a database error, the other silently stranded every
 * conversation. Migrating is out of scope for now; KNOWING is not: an install over
 * incompatible data must say so, plainly, instead of looking broken.
 *
 * HOW. A marker in AsyncStorage names the data format this build writes. Bump
 * `DATA_FORMAT` whenever a stack upgrade makes earlier saved data unusable.
 *   - marker matches            → fine.
 *   - no marker, no app data    → a fresh install: write the marker.
 *   - no marker, but app data   → written before markers existed (sereus ≤ 1.8):
 *                                 incompatible.
 *   - a different marker        → incompatible.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, STORAGE_KEY_PREFIX } from './persisted-names';

/**
 * The format this build writes. Bump on any upgrade that strands earlier data.
 *   sereus-1.9   strand network state replaced the peer book.
 *   sereus-1.11  optimystic 1.9 and libp2p 3.3; a new PendingJoin control table. Not
 *                known to break 1.9 data, but bumped so testers start clean rather
 *                than chase faults carried over from it (internal testing, no users).
 *   sereus-1.12  optimystic 1.10.1; chat tables tagged for change notification.
 *   sereus-1.14  optimystic 1.12.1; control approvals now sign the party id, so
 *                earlier control data does not verify.
 *   sereus-1.14-kit  the node is built by the cadre kit (`createPhoneNode`): the
 *                identity, trusted owners and joined strands move to the keychain, the
 *                party id and relays to the kit's saved start, and the databases are
 *                renamed (`persisted-names.ts`). Nothing is carried over.
 *   sereus-1.15  each machine's signed address record carries its node profile, so a
 *                control store made by 1.14 fails its warm start ("parties created with
 *                1.14 or earlier must be recreated"); optimystic 1.13.0.
 */
export const DATA_FORMAT = 'sereus-1.15';

const MARKER_KEY = STORAGE_KEYS.dataFormat;
const APP_PREFIX = STORAGE_KEY_PREFIX;
/** Keys that say nothing about network data and may exist before first use. */
const HARMLESS = new Set<string>([MARKER_KEY, STORAGE_KEYS.themeMode]);

export type DataFormatCheck =
  | { ok: true }
  | { ok: false; found: string; expected: string };

export async function checkDataFormat(): Promise<DataFormatCheck> {
  const marker = await AsyncStorage.getItem(MARKER_KEY);
  if (marker === DATA_FORMAT) return { ok: true };
  if (marker !== null) return { ok: false, found: marker, expected: DATA_FORMAT };

  const keys = await AsyncStorage.getAllKeys();
  const hasAppData = keys.some(k => k.startsWith(APP_PREFIX) && !HARMLESS.has(k));
  if (hasAppData) return { ok: false, found: 'an earlier version (sereus 1.8 or older)', expected: DATA_FORMAT };

  await AsyncStorage.setItem(MARKER_KEY, DATA_FORMAT);
  return { ok: true };
}
