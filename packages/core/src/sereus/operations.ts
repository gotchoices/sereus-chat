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

/** A random UUID v4, for rows and strands. Every runtime the core targets provides
 *  `crypto.getRandomValues` (React Native through the kit's polyfills). */
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

/**
 * Run one write statement ending `returning StampId() as Tx`, and return the
 * transaction's id: what the stack reports its durability and queue status under
 * (`delivery.ts`). One statement holds Quereus's execution lock for its whole run, so no
 * other writer's commit is mixed in (sereus strands.md, "A commit's durability").
 * Undefined when the statement wrote nothing (an `insert or ignore` that ignored).
 */
async function writeTx(db: Database, sql: string, params: unknown[]): Promise<string | undefined> {
  let tx: string | undefined;
  for await (const row of db.eval(sql, params as never)) tx ??= (row.Tx as string | undefined) ?? undefined;
  return tx;
}

/** Now, in UTC, as this app stores DATETIME: 'YYYY-MM-DD HH:MM:SS.fff'. */
function storedNow(): string {
  return new Date().toISOString().replace('T', ' ').replace(/Z$/, '');
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
 * A stored datetime as an ISO 8601 UTC string. This app writes DATETIME in UTC as
 * 'YYYY-MM-DD HH:MM:SS' (`insertMessage`), and Quereus reads it back as
 * 'YYYY-MM-DDTHH:MM:SS', still with no zone. Parsed as it is, `Date` reads that as
 * LOCAL time: every message showed the hour of UTC, six hours off in Mountain time.
 * Anything already zoned passes through.
 */
export function storedUtcToIso(stored: string): string;
export function storedUtcToIso(stored: string | null): string | null;
export function storedUtcToIso(stored: string | null): string | null {
  if (!stored) return stored;
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(stored) ? `${stored.replace(' ', 'T')}Z` : stored;
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
): Promise<string | undefined> {
  const db = getDb(strand);
  // READ FIRST, write only what changed. Every send calls this, and each write is
  // a strand commit that the other members must agree to. Writing the row
  // unconditionally (an insert-or-ignore plus an update) took a send from 0.6 s to
  // 3.4 s in Node, and bundling both into the message's transaction still cost
  // 2.6 s, because the commit then spans two tables
  // (test/stack/message-latency.mjs, SEND_MODE=app|bundled|check).
  let current: string | null | undefined;
  for await (const row of db.eval('select Name from App.Member where Id = ?', [id])) {
    current = row.Name as string | null;
  }
  if (current === name) return undefined;
  if (current === undefined) {
    return writeTx(db, 'insert or ignore into App.Member (Id, Name) values (?, ?) returning StampId() as Tx', [id, name]);
  }
  return writeTx(db, 'update App.Member set Name = ? where Id = ? returning StampId() as Tx', [name, id]);
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
): Promise<ChatMessageRow & { Tx?: string }> {
  const db = getDb(strand);
  // Quereus DATETIME wants 'YYYY-MM-DD HH:MM:SS[.fff]', not ISO 8601 with T/Z. The
  // milliseconds stay: two messages sent in the same second were ordered by their random
  // ids, so they could show in the wrong order (seen in the offline scenarios).
  const now = storedNow();

  // A client-generated UUID, never max(Id)+1: two members composing at once
  // would compute the same id, and upstream keeps one silently while telling
  // both writers they succeeded (optimystic-concurrent-same-pk-insert-silent-lww).
  const id = newId();

  const tx = await writeTx(db,
    `insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId)
     values (?, ?, ?, ?, ?) returning StampId() as Tx`,
    [id, memberId, content, now, replyToId ?? null],
  );

  return { Id: id, MemberId: memberId, Content: content, Timestamp: storedUtcToIso(now), ReplyToId: replyToId ?? null, Tx: tx };
}

/** Newest last; capped to `limit`. */
export async function queryMessages(
  strand: StrandInstance,
  limit = 100,
): Promise<ChatMessageRow[]> {
  const db = getDb(strand);
  const out: ChatMessageRow[] = [];
  // The NEWEST `limit` rows, returned oldest-first. Ordering ascending before the
  // limit returned the OLDEST ones instead: the strand list's one-row preview
  // showed a conversation's first message forever, and a conversation past 100
  // messages stopped showing anything new.
  // NO JOIN, and the member names read separately: Optimystic walks `MessageByTime` backwards
  // and stops after `limit` rows only for a single-table query (1.26: "joins are unchanged").
  // With the Member join the read still scanned and sorted the whole conversation (5,000
  // messages: 105 ms against 23 ms in Node, test/stack/history-scale.mjs). Member is small.
  const names = new Map<string, string>();
  for await (const m of db.eval('select Id, Name from App.Member')) names.set(m.Id as string, m.Name as string);
  for await (const row of db.eval(
    `select Id, MemberId, Content, Timestamp, ReplyToId, EditedAt
     from App.Message
     order by Timestamp desc, Id desc
     limit ?`,
    [limit],
  )) {
    out.push({
      Id: row.Id as string,
      MemberId: row.MemberId as string,
      Content: row.Content as string,
      Timestamp: storedUtcToIso(row.Timestamp as string),
      ReplyToId: (row.ReplyToId as string) ?? null,
      EditedAt: storedUtcToIso((row.EditedAt as string) ?? null),
      MemberName: names.get(row.MemberId as string),
    });
  }
  return out.reverse();
}

// ── Editing, deleting, reacting ────────────────────────────────────────────
// All ordinary SQL against the strand database.  Deletion removes the row and
// propagates; it has no reach over copies cached elsewhere, and the app never
// renders a tombstone of its own.

export async function updateMessage(
  strand: StrandInstance, id: string, content: string,
): Promise<string | undefined> {
  const db = getDb(strand);
  const now = storedNow();
  // In place, no version chain (story 13).
  return writeTx(db, 'update App.Message set Content = ?, EditedAt = ? where Id = ? returning StampId() as Tx', [content, now, id]);
}

/** The message's own delete is the write followed; its reactions and attachments go first, as before. */
export async function removeMessage(strand: StrandInstance, id: string): Promise<string | undefined> {
  const db = getDb(strand);
  await db.exec('delete from App.Reaction where MessageId = ?', [id]);
  await db.exec('delete from App.Attachment where MessageId = ?', [id]);
  return writeTx(db, 'delete from App.Message where Id = ? returning StampId() as Tx', [id]);
}

export async function addReaction(
  strand: StrandInstance, messageId: string, memberId: string, symbol: string,
): Promise<string | undefined> {
  const db = getDb(strand);
  return writeTx(db,
    'insert or ignore into App.Reaction (MessageId, MemberId, Symbol) values (?, ?, ?) returning StampId() as Tx',
    [messageId, memberId, symbol],
  );
}

export async function removeReaction(
  strand: StrandInstance, messageId: string, memberId: string, symbol: string,
): Promise<string | undefined> {
  const db = getDb(strand);
  return writeTx(db,
    'delete from App.Reaction where MessageId = ? and MemberId = ? and Symbol = ? returning StampId() as Tx',
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

/** Persist attachments for a message.  Nothing wrote App.Attachment before
 *  this: an attachment picked in the composer never reached the strand. */
export async function insertAttachments(
  strand: StrandInstance,
  messageId: string,
  attachments: Array<{
    type: string; uri?: string | null; mimeType?: string; name?: string;
    byteSize?: number | null; durationMs?: number | null;
  }>,
): Promise<AttachmentRow[]> {
  if (!attachments.length) return [];
  const db = getDb(strand);
  const rows: AttachmentRow[] = [];
  for (const a of attachments) {
    const id = newId();
    await db.exec(
      `insert into App.Attachment (Id, MessageId, Type, Uri, MimeType, Name, ByteSize, DurationMs)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, messageId, a.type, a.uri ?? null, a.mimeType ?? null, a.name ?? null,
       a.byteSize ?? null, a.durationMs ?? null],
    );
    rows.push({
      Id: id, MessageId: messageId, Type: a.type, Uri: a.uri ?? null,
      MimeType: a.mimeType, Name: a.name,
      ByteSize: a.byteSize ?? null, DurationMs: a.durationMs ?? null,
    });
  }
  return rows;
}
