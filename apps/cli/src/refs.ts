/**
 * Naming strands and messages on the command line: a row number from the last listing
 * shown (saved in the profile, so `strands` then `send 3` is safe even if the order has
 * changed since), an id or a unique beginning of one, or — for strands — an exact title.
 */

export class RefError extends Error {
  constructor(message: string) { super(message); this.name = 'RefError'; }
}

const MIN_PREFIX = 4;

export interface Named { id: string; title?: string }

/**
 * Resolve `ref` against `candidates` (the current list) and `lastRows` (ids in the order
 * last printed; row 1 is index 0).
 */
export function resolveRef<T extends Named>(ref: string, candidates: T[], lastRows: string[], what = 'strand'): T {
  const byId = (id: string) => candidates.find(c => c.id === id);
  if (/^#?\d+$/.test(ref)) {
    const row = Number(ref.replace('#', ''));
    const id = lastRows[row - 1];
    if (id === undefined) throw new RefError(`no ${what} at row ${row} of the last listing (it had ${lastRows.length})`);
    const found = byId(id);
    if (!found) throw new RefError(`row ${row} was ${id}, which is no longer here`);
    return found;
  }
  const exact = byId(ref);
  if (exact) return exact;
  if (ref.length >= MIN_PREFIX) {
    const prefixed = candidates.filter(c => c.id.startsWith(ref));
    if (prefixed.length === 1) return prefixed[0];
    if (prefixed.length > 1) throw new RefError(`${JSON.stringify(ref)} starts ${prefixed.length} ${what} ids: ${prefixed.map(c => c.id).join(', ')}`);
  }
  const lower = ref.toLowerCase();
  const titled = candidates.filter(c => c.title?.toLowerCase() === lower);
  if (titled.length === 1) return titled[0];
  if (titled.length > 1) throw new RefError(`${titled.length} ${what}s are called ${JSON.stringify(ref)}: ${titled.map(c => c.id).join(', ')}`);
  throw new RefError(`no ${what} matches ${JSON.stringify(ref)}`);
}
