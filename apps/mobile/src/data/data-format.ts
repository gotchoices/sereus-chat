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

/** The format this build writes. Bump on any upgrade that strands earlier data. */
export const DATA_FORMAT = 'sereus-1.9';

const MARKER_KEY = '@sereus.chat/dataFormat';
const APP_PREFIX = '@sereus.chat/';
/** Keys that say nothing about network data and may exist before first use. */
const HARMLESS = new Set([MARKER_KEY, '@sereus.chat/themeMode']);

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
