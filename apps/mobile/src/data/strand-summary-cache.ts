/**
 * strand-summary-cache.ts — the strand list as it last stood, kept on the device.
 *
 * WHY. After a cold start a strand is listed only once its database has opened, and
 * a strand joined from another party re-attaches last. On two phones (sereus 1.11)
 * that took about 2 minutes, and the list said "No strands yet" all the while: a
 * tester reads that as their conversations being gone. So each open strand's row is
 * saved here as it is listed, and a strand that is known but not open yet is shown
 * from it, marked as connecting.
 *
 * Device-local and disposable: losing it costs only that early view. A strand left
 * on purpose is dropped from it (`forgetStrandSummary`), so it cannot come back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StrandSummary } from './types';

const KEY = '@sereus.chat/strandSummaries';

/** What is worth showing before the strand opens; the rest is recomputed when it does. */
export type CachedSummary = Pick<StrandSummary, 'id' | 'title' | 'avatarUri' | 'isGroup' | 'memberCount' | 'lastMessage'>;

export async function readStrandSummaries(): Promise<Record<string, CachedSummary>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, CachedSummary>)
      : {};
  } catch {
    return {};
  }
}

/** Save the rows of every strand that is open now. Strands not in `rows` are kept. */
export async function saveStrandSummaries(rows: StrandSummary[]): Promise<void> {
  if (!rows.length) return;
  const all = await readStrandSummaries();
  const before = JSON.stringify(all);
  for (const s of rows) {
    all[s.id] = {
      id: s.id, title: s.title, avatarUri: s.avatarUri ?? null,
      isGroup: s.isGroup, memberCount: s.memberCount, lastMessage: s.lastMessage ?? null,
    };
  }
  const after = JSON.stringify(all);
  if (after === before) return;   // the list refreshes every few seconds; most passes change nothing
  try { await AsyncStorage.setItem(KEY, after); } catch { /* disposable */ }
}

export async function forgetStrandSummary(strandId: string): Promise<void> {
  const all = await readStrandSummaries();
  if (!(strandId in all)) return;
  delete all[strandId];
  try { await AsyncStorage.setItem(KEY, JSON.stringify(all)); } catch { /* disposable */ }
}
