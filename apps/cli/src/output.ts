/**
 * Output for pipes: one record per line, tab-separated fields in a fixed order, or one
 * JSON object per line (`--json`). Data goes to stdout and nothing else does.
 * Spec: design/specs/cli/commands.md → Output.
 */

export type Field = string | number | boolean | null | undefined;
export type Row = Record<string, Field>;

/** Escape a field so a record stays on one line: tab, newline, CR and backslash. */
export function escapeField(value: Field): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).replace(/[\\\t\n\r]/g, c => (c === '\\' ? '\\\\' : c === '\t' ? '\\t' : c === '\n' ? '\\n' : '\\r'));
}

export interface Output {
  /** Records with these columns, in this order. */
  rows(columns: readonly string[], rows: Row[]): void;
  /**
   * `key<TAB>value` lines. An array value repeats the key; an array inside it is one line
   * of several fields (`relay<TAB>reserved<TAB>/ip4/…`).
   */
  pairs(pairs: Array<[string, Field | Array<Field | Field[]>]>): void;
  /** Progress and notes: stderr, never stdout. */
  note(text: string): void;
}

export function createOutput(opts: { json: boolean; header: boolean; write?: (s: string) => void; writeErr?: (s: string) => void }): Output {
  const write = opts.write ?? (s => { process.stdout.write(s); });
  const writeErr = opts.writeErr ?? (s => { process.stderr.write(s); });
  let headerShown = new Set<string>();
  return {
    rows(columns, rows) {
      if (opts.json) {
        for (const row of rows) write(`${JSON.stringify(Object.fromEntries(columns.map(c => [c, row[c] ?? null])))}\n`);
        return;
      }
      const key = columns.join('\t');
      if (opts.header && !headerShown.has(key)) { write(`${key}\n`); headerShown = new Set([...headerShown, key]); }
      for (const row of rows) write(`${columns.map(c => escapeField(row[c])).join('\t')}\n`);
    },
    pairs(pairs) {
      if (opts.json) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of pairs) obj[k] = v ?? null;
        write(`${JSON.stringify(obj)}\n`);
        return;
      }
      for (const [k, v] of pairs) {
        const values = Array.isArray(v) ? v : [v];
        for (const one of values) write(`${k}\t${Array.isArray(one) ? one.map(escapeField).join('\t') : escapeField(one)}\n`);
      }
    },
    note(text) { writeErr(`${text}\n`); },
  };
}
