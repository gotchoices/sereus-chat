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
  Id: number;
  MemberId: string;
  Content: string;
  Timestamp: string;
  Status?: string;
  /** Joined from Member table when available. */
  MemberName?: string;
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
): Promise<ChatMessageRow> {
  const db = getDb(strand);
  // Quereus DATETIME wants 'YYYY-MM-DD HH:MM:SS', not ISO 8601 with T/Z.
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

  const maxRow = await db.get('select max(Id) as MaxId from App.Message');
  const nextId = ((maxRow?.MaxId as number | null) ?? 0) + 1;

  await db.exec(
    `insert into App.Message (Id, MemberId, Content, Timestamp, Status)
     values (?, ?, ?, ?, ?)`,
    [nextId, memberId, content, now, 'sent'],
  );

  return { Id: nextId, MemberId: memberId, Content: content, Timestamp: now, Status: 'sent' };
}

/** Newest last; capped to `limit`. */
export async function queryMessages(
  strand: StrandInstance,
  limit = 100,
): Promise<ChatMessageRow[]> {
  const db = getDb(strand);
  const out: ChatMessageRow[] = [];
  for await (const row of db.eval(
    `select M.Id, M.MemberId, M.Content, M.Timestamp, M.Status, Mem.Name as MemberName
     from App.Message M
     left join App.Member Mem on Mem.Id = M.MemberId
     order by M.Id asc
     limit ?`,
    [limit],
  )) {
    out.push({
      Id: row.Id as number,
      MemberId: row.MemberId as string,
      Content: row.Content as string,
      Timestamp: row.Timestamp as string,
      Status: (row.Status as string) ?? undefined,
      MemberName: (row.MemberName as string) ?? undefined,
    });
  }
  return out;
}
