/**
 * A session: one profile's node, model and output, and what commands share — naming
 * strands and messages, the rows of the last listings, how failures leave.
 */
import { createTranslator, errorText, type Translator } from '@chat/resources';
import type { ChatError, ChatModel, Message, Result, StrandSummary } from '@chat/core';
import { readJson, writeJsonAtomic, type ProfileConfig, type ProfileDirs } from './home.js';
import type { CliHost } from './host.js';
import type { Output } from './output.js';
import { RefError, resolveRef } from './refs.js';

/** Exit codes (design/specs/cli/commands.md → Exit codes). */
export const EXIT = { ok: 0, usage: 1, failed: 2, retryable: 3, notFound: 4, interrupted: 130 } as const;

/** A failure that ends a command with a message and an exit code. */
export class CliFailure extends Error {
  constructor(message: string, readonly code: number) { super(message); this.name = 'CliFailure'; }
}

export class UsageError extends CliFailure {
  constructor(message: string) { super(message, EXIT.usage); }
}

/** The rows of the last listings, so a row number means what was printed. */
interface LastRows {
  strands: string[];
  messages: Record<string, string[]>;
}

export interface Session {
  model: ChatModel;
  host: CliHost;
  out: Output;
  t: Translator;
  dirs: ProfileDirs;
  config: ProfileConfig;
  verbose: boolean;
  /** A person is at a terminal to answer questions. */
  interactive: boolean;
  /** Resolves once the node has started and the model has booted. */
  ready: Promise<void>;
  /** Ask a yes/no question on the terminal; false when nobody can answer. */
  confirm(question: string): Promise<boolean>;
  /** Aborted by Ctrl-C while a long command (`tail`) runs. */
  signal: AbortSignal;

  /** The value, or a `CliFailure` worded from the catalog with the right exit code. */
  unwrap<T>(result: Result<T>): T;
  strand(ref: string): Promise<StrandSummary>;
  strands(): Promise<StrandSummary[]>;
  message(strandId: string, ref: string): Promise<Message>;
  rememberStrands(ids: string[]): Promise<void>;
  rememberMessages(strandId: string, ids: string[]): Promise<void>;
}

export interface SessionParts {
  model: ChatModel;
  host: CliHost;
  out: Output;
  dirs: ProfileDirs;
  config: ProfileConfig;
  verbose: boolean;
  interactive: boolean;
  ready: Promise<void>;
  confirm(question: string): Promise<boolean>;
  signal: () => AbortSignal;
}

export function createSession(parts: SessionParts): Session {
  const t = createTranslator(process.env.LANG?.slice(0, 2) ?? 'en');
  let last: LastRows | undefined;
  const loadLast = async () => (last ??= (await readJson<LastRows>(parts.dirs.lastFile)) ?? { strands: [], messages: {} });
  const saveLast = async () => { if (last) await writeJsonAtomic(parts.dirs.lastFile, last); };

  const failure = (error: ChatError) => {
    const words = errorText(t, error);
    const detail = parts.verbose && words !== error.message ? ` [${error.kind}: ${error.message}]` : '';
    return new CliFailure(`${words}${detail}`, error.retryable ? EXIT.retryable : EXIT.failed);
  };

  const session: Session = {
    ...parts,
    t,
    get signal() { return parts.signal(); },
    unwrap(result) {
      if (result.ok) return result.value;
      throw failure(result.error);
    },
    async strands() {
      return session.unwrap(await parts.model.strands.list());
    },
    async strand(ref) {
      const rows = (await loadLast()).strands;
      return asNotFound(async () => resolveRef(ref, await session.strands(), rows));
    },
    async message(strandId, ref) {
      const rows = (await loadLast()).messages[strandId] ?? [];
      const messages = session.unwrap(await parts.model.messages.list(strandId, { limit: 500 }));
      return asNotFound(async () => resolveRef(ref, messages, rows, 'message'));
    },
    async rememberStrands(ids) {
      (await loadLast()).strands = ids;
      await saveLast();
    },
    async rememberMessages(strandId, ids) {
      (await loadLast()).messages[strandId] = ids;
      await saveLast();
    },
  };
  return session;
}

/** Run `resolve`, turning a naming failure into exit code 4. */
async function asNotFound<T>(resolve: () => Promise<T>): Promise<T> {
  try {
    return await resolve();
  } catch (err) {
    if (err instanceof RefError) throw new CliFailure(err.message, EXIT.notFound);
    throw err;
  }
}
