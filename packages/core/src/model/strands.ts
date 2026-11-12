import type { Result } from './result.js';

export type Muted = 'none' | 'soft' | 'hard';
export type Visibility = 'public' | 'private';

export type StrandSummary = {
  id: string;
  title: string;
  avatarUri?: string | null;
  isGroup: boolean;
  memberCount: number;
  lastMessage?: {
    previewText: string;
    /** null in strands of two — the row omits the prefix. */
    senderName: string | null;
    timestamp: string;
  } | null;
  unreadCount: number;
  mentioned: boolean;
  muted: Muted;
  /** Device-local. An unsent draft never leaves the device. */
  draftPreview: string | null;
  archived: boolean;
  pending: boolean;
  /**
   * Known to this device but not open yet (a cold start, a joined strand still
   * re-attaching). The row comes from the last list this device showed, marked as
   * connecting.
   */
  opening?: boolean;
  /**
   * The user's private note on this strand: what it is for, who they invited. Only the user's
   * own machines hold it; no other member ever sees it.
   */
  note?: string | null;
};

/**
 * Derived from recorded state only — never from activity or silence.
 * settled === (visibility === 'private' && managerCount === 0)
 */
export type StrandState = {
  visibility: Visibility;
  managerCount: number;
  settled: boolean;
  canIManage: boolean;
};

/** This device's own settings for a strand (story 33). Never strand data. */
export type StrandSettings = { muted: Muted; archived: boolean };

/**
 * What a strand is, in one of three states — and only three (strand-detail spec):
 * `public` (anyone with the link joins; nobody can be removed), `canChange` (invited
 * people only; someone can still add or remove), `settled` (nobody, ever). Derived only
 * from recorded state, never from activity. Words: `status.strand.<kind>` in the catalogs.
 */
export type StrandStatusKind = 'public' | 'canChange' | 'settled';

export function strandStatusKind(state: Pick<StrandState, 'visibility' | 'managerCount'>): StrandStatusKind {
  if (state.visibility === 'public') return 'public';
  return state.managerCount === 0 ? 'settled' : 'canChange';
}

/** The one rule `StrandState.settled` follows (ops.md). */
export function isSettled(state: Pick<StrandState, 'visibility' | 'managerCount'>): boolean {
  return state.visibility === 'private' && state.managerCount === 0;
}

export interface StrandsModel {
  list(): Promise<Result<StrandSummary[]>>;
  /**
   * Is the node still bringing strands up? An empty list means one of two very
   * different things — "you are in no conversations" or "not finished attaching them
   * yet" — and a screen that cannot tell them apart shows a first-run message to
   * someone who has strands.
   */
  settling(): Promise<boolean>;
  /** Why start-up failed, or null. A failed start and a slow one are not the same thing. */
  bootError(): Promise<string | null>;
  /** Re-attempt start-up after a failure. */
  retryBoot(): Promise<Result<void>>;
  /** Device-local (story 33). */
  settings(strandId: string): Promise<Result<StrandSettings>>;
  /** The user's private note on a strand, or null. */
  note(strandId: string): Promise<Result<string | null>>;
  /** Set (or, with null or blank, remove) the user's private note on a strand. Reaches nobody else. */
  setNote(strandId: string, text: string | null): Promise<Result<void>>;
  /** Device-local (story 33): never reaches the other members. */
  setMuted(strandId: string, muted: Muted): Promise<Result<void>>;
  /** Device-local (story 33): never reaches the other members. */
  setArchived(strandId: string, archived: boolean): Promise<Result<void>>;
  state(strandId: string): Promise<Result<StrandState>>;
  /**
   * keepIdentity:false is permanent — a later return is as a new member. Fails
   * `unsent-messages` while this device holds writes here it has not sent; ask, then
   * leave again with `discardUnsent` to withdraw them.
   */
  leave(strandId: string, opts: { keepIdentity: boolean; discardUnsent?: boolean }): Promise<Result<void>>;
}
