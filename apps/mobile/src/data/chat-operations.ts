/**
 * chat-operations.ts — Quereus SQL helpers for the chat sApp schema.
 *
 * Operates on the StrandDatabase exposed by a StrandInstance.  Tables live
 * under the `App` schema namespace (StrandDatabase wraps DDL in
 * `declare schema App { … }; apply schema App;`).
 *
 * Mirrors sereus/packages/reference-app-rn/src/chat-operations.ts.
 */

import type { StrandInstance } from '@serfab/cadre-core';
import type { Database } from '@quereus/quereus';

export interface ChatMember {
  Id: string;
  Name: string;
  AvatarUri?: string;
}

export interface ChatMessageRow {
  Id: string;                 // client-generated UUID
  MemberId: string;
  Content: string;
  Timestamp: string;          // asserted by the sender; not authoritative
  ReplyToId?: string | null;
  EditedAt?: string | null;
  /** Joined from Member table when available. */
  MemberName?: string;
}

/** Random id for a new row.  `react-native-get-random-values` polyfills
 *  `crypto.getRandomValues`, which is imported at app entry. */
export function newId(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const b = new Uint8Array(16);
  g.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function getDb(strand: StrandInstance): Database {
  if (!strand.database) {
    throw new Error(
      `Strand ${strand.strandId} database not available (status: ${strand.status})`,
    );
  }
  return strand.database.getDatabase();
}

// ── Members ────────────────────────────────────────────────────────────────

/** Idempotent self-registration. */
export async function insertMember(
  strand: StrandInstance,
  id: string,
  name: string,
): Promise<void> {
  const db = getDb(strand);
  await db.exec(
    'insert or ignore into App.Member (Id, Name) values (?, ?)',
    [id, name],
  );
}

/**
 * Upsert a member's display name.  Inserts if absent, updates if present.
 * Used when the local profile name changes and we want every attached
 * strand's Member row to reflect it.
 */
export async function upsertMember(
  strand: StrandInstance,
  id: string,
  name: string,
): Promise<void> {
  const db = getDb(strand);
  await db.exec(
    'insert or ignore into App.Member (Id, Name) values (?, ?)',
    [id, name],
  );
  await db.exec(
    'update App.Member set Name = ? where Id = ?',
    [name, id],
  );
}

export async function queryMembers(strand: StrandInstance): Promise<ChatMember[]> {
  const db = getDb(strand);
  const out: ChatMember[] = [];
  for await (const row of db.eval('select Id, Name, AvatarUri from App.Member')) {
    out.push({
      Id: row.Id as string,
      Name: row.Name as string,
      AvatarUri: (row.AvatarUri as string) ?? undefined,
    });
  }
  return out;
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function insertMessage(
  strand: StrandInstance,
  memberId: string,
  content: string,
  replyToId?: string | null,
): Promise<ChatMessageRow> {
  const db = getDb(strand);
  // Quereus DATETIME wants 'YYYY-MM-DD HH:MM:SS', not ISO 8601 with T/Z.
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

  // A client-generated UUID, never max(Id)+1: two members composing at once
  // would compute the same id, and upstream keeps one silently while telling
  // both writers they succeeded (optimystic-concurrent-same-pk-insert-silent-lww).
  const id = newId();

  await db.exec(
    `insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId)
     values (?, ?, ?, ?, ?)`,
    [id, memberId, content, now, replyToId ?? null],
  );

  return { Id: id, MemberId: memberId, Content: content, Timestamp: now, ReplyToId: replyToId ?? null };
}

/** Newest last; capped to `limit`. */
export async function queryMessages(
  strand: StrandInstance,
  limit = 100,
): Promise<ChatMessageRow[]> {
  const db = getDb(strand);
  const out: ChatMessageRow[] = [];
  for await (const row of db.eval(
    `select M.Id, M.MemberId, M.Content, M.Timestamp, M.ReplyToId, M.EditedAt,
            Mem.Name as MemberName
     from App.Message M
     left join App.Member Mem on Mem.Id = M.MemberId
     order by M.Timestamp asc, M.Id asc
     limit ?`,
    [limit],
  )) {
    out.push({
      Id: row.Id as string,
      MemberId: row.MemberId as string,
      Content: row.Content as string,
      Timestamp: row.Timestamp as string,
      ReplyToId: (row.ReplyToId as string) ?? null,
      EditedAt: (row.EditedAt as string) ?? null,
      MemberName: (row.MemberName as string) ?? undefined,
    });
  }
  return out;
}

// ── Editing, deleting, reacting ────────────────────────────────────────────
// All ordinary SQL against the strand database.  Deletion removes the row and
// propagates; it has no reach over copies cached elsewhere, and the app never
// renders a tombstone of its own.

export async function updateMessage(
  strand: StrandInstance, id: string, content: string,
): Promise<void> {
  const db = getDb(strand);
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  // In place, no version chain (story 13).
  await db.exec('update App.Message set Content = ?, EditedAt = ? where Id = ?', [content, now, id]);
}

export async function removeMessage(strand: StrandInstance, id: string): Promise<void> {
  const db = getDb(strand);
  await db.exec('delete from App.Reaction where MessageId = ?', [id]);
  await db.exec('delete from App.Attachment where MessageId = ?', [id]);
  await db.exec('delete from App.Message where Id = ?', [id]);
}

export async function addReaction(
  strand: StrandInstance, messageId: string, memberId: string, symbol: string,
): Promise<void> {
  const db = getDb(strand);
  await db.exec(
    'insert or ignore into App.Reaction (MessageId, MemberId, Symbol) values (?, ?, ?)',
    [messageId, memberId, symbol],
  );
}

export async function removeReaction(
  strand: StrandInstance, messageId: string, memberId: string, symbol: string,
): Promise<void> {
  const db = getDb(strand);
  await db.exec(
    'delete from App.Reaction where MessageId = ? and MemberId = ? and Symbol = ?',
    [messageId, memberId, symbol],
  );
}

export interface ReactionRow { MessageId: string; MemberId: string; Symbol: string }

export async function queryReactions(strand: StrandInstance): Promise<ReactionRow[]> {
  const db = getDb(strand);
  const out: ReactionRow[] = [];
  for await (const r of db.eval('select MessageId, MemberId, Symbol from App.Reaction')) {
    out.push({
      MessageId: r.MessageId as string,
      MemberId: r.MemberId as string,
      Symbol: r.Symbol as string,
    });
  }
  return out;
}

export interface AttachmentRow {
  Id: string; MessageId: string; Type: string; Uri: string | null;
  MimeType?: string; Name?: string; ByteSize?: number | null; DurationMs?: number | null;
}

export async function queryAttachments(strand: StrandInstance): Promise<AttachmentRow[]> {
  const db = getDb(strand);
  const out: AttachmentRow[] = [];
  for await (const r of db.eval(
    `select Id, MessageId, Type, Uri, MimeType, Name, ByteSize, DurationMs
     from App.Attachment`,
  )) {
    out.push({
      Id: r.Id as string,
      MessageId: r.MessageId as string,
      Type: r.Type as string,
      Uri: (r.Uri as string) ?? null,
      MimeType: (r.MimeType as string) ?? undefined,
      Name: (r.Name as string) ?? undefined,
      ByteSize: (r.ByteSize as number) ?? null,
      DurationMs: (r.DurationMs as number) ?? null,
    });
  }
  return out;
}
