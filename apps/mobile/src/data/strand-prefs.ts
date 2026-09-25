/**
 * strand-prefs.ts — per-strand settings that belong to this device and nobody else.
 *
 * `design/specs/domain/ops.md`: "`mentioned`, `draftPreview`, `muted`, `archived`
 * are device-local; they never touch strand data." So they live here, in
 * AsyncStorage, and not in the strand's Quereus tables — muting a conversation
 * must not write anything the other members can see, and archiving must not
 * change the strand for anyone else.
 *
 * Story 33 is where the meanings come from:
 *
 *   Mute    — "He stays in the strand and his machines carry on taking part.
 *              Messages still arrive; he simply is not told about them." Two
 *              depths: `soft` is silent unless somebody names him, `hard` is
 *              silent whatever happens.
 *   Archive — "Hide it from your list; nothing changes for anyone else."
 *
 * Neither is leaving. Both are reversible and cost nothing, which is exactly why
 * they are offered above `Leave` in the same menu.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@sereus.chat/strandPrefs';

export type MuteMode = 'none' | 'soft' | 'hard';

export type StrandPrefs = {
  muted: MuteMode;
  archived: boolean;
};

const DEFAULTS: StrandPrefs = { muted: 'none', archived: false };

type PrefsMap = Record<string, StrandPrefs>;

async function readAll(): Promise<PrefsMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // NORMALISED on the way in. This is read back from storage an older build
    // wrote, and a bad value here would otherwise reach the UI as a mute mode
    // nothing handles — rendering a strand that can never be un-muted.
    const out: PrefsMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = (value ?? {}) as Record<string, unknown>;
      out[id] = {
        muted: v.muted === 'soft' || v.muted === 'hard' ? v.muted : 'none',
        archived: v.archived === true,
      };
    }
    return out;
  } catch {
    // A corrupt blob must not brick the strand list; defaults are harmless.
    return {};
  }
}

/** Every strand's local settings, for one pass over the list. */
export async function getAllStrandPrefs(): Promise<PrefsMap> {
  return readAll();
}

/** One strand's local settings, defaulted. */
export async function getStrandPrefs(strandId: string): Promise<StrandPrefs> {
  const all = await readAll();
  return all[strandId] ?? DEFAULTS;
}

async function patch(strandId: string, change: Partial<StrandPrefs>): Promise<void> {
  const all = await readAll();
  const next: PrefsMap = { ...all, [strandId]: { ...(all[strandId] ?? DEFAULTS), ...change } };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function setStrandMuted(strandId: string, muted: MuteMode): Promise<void> {
  await patch(strandId, { muted });
}

export async function setStrandArchived(strandId: string, archived: boolean): Promise<void> {
  await patch(strandId, { archived });
}

/**
 * Drop a strand's settings — for a strand being forgotten, so a later re-join
 * does not silently inherit a mute the user set months ago and has no memory of.
 */
export async function clearStrandPrefs(strandId: string): Promise<void> {
  const all = await readAll();
  delete all[strandId];
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}
