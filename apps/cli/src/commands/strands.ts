/** Strands and messages: `strands`, `log`, `tail`, `send`, `members`, `mute`, `archive`, `leave`. */
import type { Member, Message, Muted, StrandSummary } from '@chat/core';
import { UsageError, type Session } from '../session.js';
import type { Row } from '../output.js';
import { need, type Command } from './command.js';

export const STRAND_COLUMNS = ['row', 'id', 'title', 'members', 'unread', 'lastAt', 'lastFrom', 'lastText'] as const;
export const MESSAGE_COLUMNS = ['row', 'strandId', 'messageId', 'time', 'from', 'text', 'replyTo', 'edited', 'attachments'] as const;

function strandRow(row: number, s: StrandSummary): Row {
  const opening = s.opening || s.pending;
  return {
    row,
    id: s.id,
    title: s.title,
    members: s.memberCount,
    unread: s.unreadCount,
    lastAt: opening ? '' : s.lastMessage?.timestamp,
    lastFrom: s.lastMessage?.senderName,
    lastText: opening ? '(opening)' : s.lastMessage?.previewText,
  };
}

/**
 * Member id → the name to print (`me` for this profile). An id it has not seen re-reads
 * the members once, so someone who joined since (a `tail` running for a while) gets a name.
 */
type Senders = ((memberId: string) => string) & { refresh(ids: string[]): Promise<void> };

async function senders(session: Session, strandId: string): Promise<Senders> {
  const names = new Map<string, string>();
  const load = async () => {
    const result = await session.model.members.list(strandId);
    const members: Member[] = result.ok ? result.value : [];
    for (const m of members) names.set(m.id, m.isMe ? 'me' : m.name);
  };
  await load();
  const reloaded = new Set<string>();
  const lookup = (id: string) => names.get(id) ?? id;
  lookup.refresh = async (ids: string[]) => {
    const unknown = ids.filter(id => !names.has(id) && !reloaded.has(id));
    if (!unknown.length) return;
    unknown.forEach(id => reloaded.add(id));
    await load();
  };
  return lookup;
}

function messageRow(row: number | '', strandId: string, m: Message, from: (id: string) => string): Row {
  return {
    row,
    strandId,
    messageId: m.id,
    time: m.timestamp,
    from: from(m.memberId),
    text: m.content,
    replyTo: m.replyToId,
    edited: m.editedAt,
    attachments: m.attachments.length || '',
  };
}

const strands: Command = {
  name: 'strands',
  noArgs: true,
  aliases: ['ls'],
  summary: 'List strands',
  usage: '[-a|--archived] [--all]',
  options: { archived: { type: 'boolean', short: 'a' }, all: { type: 'boolean' } },
  async run(session, _args, values) {
    const all = await session.strands();
    const shown = values.all ? all : all.filter(s => !!s.archived === !!values.archived);
    await session.rememberStrands(shown.map(s => s.id));
    session.out.rows(STRAND_COLUMNS, shown.map((s, i) => strandRow(i + 1, s)));
  },
};

const log: Command = {
  name: 'log',
  aliases: ['messages'],
  summary: 'Show a strand\'s messages, oldest first',
  usage: '<strand> [-n <count>] [--before <message>]',
  options: { count: { type: 'string', short: 'n' }, before: { type: 'string' } },
  async run(session, args, values) {
    const strand = await session.strand(need(log, args, 0, 'strand'));
    const limit = values.count === undefined ? 20 : Number(values.count);
    if (!Number.isInteger(limit) || limit < 1) throw new UsageError('log: -n takes a positive whole number');
    const before = typeof values.before === 'string' ? (await session.message(strand.id, values.before)).id : undefined;
    const messages = session.unwrap(await session.model.messages.list(strand.id, { limit, before }));
    const from = await senders(session, strand.id);
    await session.rememberMessages(strand.id, messages.map(m => m.id));
    session.out.rows(MESSAGE_COLUMNS, messages.map((m, i) => messageRow(i + 1, strand.id, m, from)));
  },
};

const tail: Command = {
  name: 'tail',
  summary: 'Print messages as they arrive, until Ctrl-C',
  usage: '<strand>... | --all',
  options: { all: { type: 'boolean' } },
  async run(session, args, values) {
    const targets = values.all ? await session.strands() : await Promise.all(args.map(ref => session.strand(ref)));
    if (!targets.length) throw new UsageError('tail: name a strand, or --all');
    const signal = session.signal;
    const stops: Array<() => void> = [];
    for (const strand of targets) {
      const from = await senders(session, strand.id);
      const seen = new Set(session.unwrap(await session.model.messages.list(strand.id, { limit: 200 })).map(m => m.id));
      let reading = false;
      let again = false;
      const read = async () => {
        if (reading) { again = true; return; }
        reading = true;
        try {
          do {
            again = false;
            const result = await session.model.messages.list(strand.id, { limit: 50 });
            if (!result.ok) continue;
            const arrivedAt = new Date().toISOString();
            await from.refresh(result.value.filter(m => !seen.has(m.id)).map(m => m.memberId));
            for (const m of result.value) {
              if (seen.has(m.id)) continue;
              seen.add(m.id);
              session.out.rows([...MESSAGE_COLUMNS, 'arrivedAt'], [{ ...messageRow('', strand.id, m, from), arrivedAt }]);
            }
          } while (again && !signal.aborted);
        } finally {
          reading = false;
        }
      };
      stops.push(session.model.changes.strand(strand.id, () => { void read(); }));
    }
    session.out.note(`following ${targets.length} strand${targets.length === 1 ? '' : 's'}; Ctrl-C to stop`);
    await new Promise<void>(resolve => {
      if (signal.aborted) resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    stops.forEach(stop => stop());
  },
};

const send: Command = {
  name: 'send',
  summary: 'Send a message ("-" reads it from stdin)',
  usage: '<strand> <text...> | <strand> - [--reply <message>]',
  options: { reply: { type: 'string' } },
  async run(session, args, values) {
    const strand = await session.strand(need(send, args, 0, 'strand'));
    let content = args.slice(1).join(' ');
    if (content === '-') {
      if (session.interactive) throw new UsageError('send: "-" reads stdin, which is the prompt here; type the text instead');
      content = (await readStdin()).replace(/\n$/, '');
    }
    if (!content) throw new UsageError(`send: missing text\nusage: send ${send.usage}`);
    const replyToId = typeof values.reply === 'string' ? (await session.message(strand.id, values.reply)).id : null;
    const started = Date.now();
    const sent = session.unwrap(await session.model.messages.send(strand.id, { content, replyToId }));
    const commitMs = Date.now() - started;
    session.out.rows([...MESSAGE_COLUMNS, 'commitMs'], [{ ...messageRow('', strand.id, sent, () => 'me'), commitMs }]);
  },
};

const members: Command = {
  name: 'members',
  summary: 'List a strand\'s members',
  usage: '<strand>',
  async run(session, args) {
    const strand = await session.strand(need(members, args, 0, 'strand'));
    const list = session.unwrap(await session.model.members.list(strand.id));
    session.out.rows(['row', 'memberId', 'name', 'manager', 'me'],
      list.map((m, i) => ({ row: i + 1, memberId: m.id, name: m.name, manager: m.isManager, me: m.isMe })));
  },
};

const MUTES: Muted[] = ['none', 'soft', 'hard'];

const mute: Command = {
  name: 'mute',
  summary: 'Mute a strand: soft (unless named), hard, or none',
  usage: '<strand> [soft|hard|none]',
  async run(session, args) {
    const strand = await session.strand(need(mute, args, 0, 'strand'));
    const level = (args[1] ?? 'soft') as Muted;
    if (!MUTES.includes(level)) throw new UsageError(`mute: ${JSON.stringify(level)} is not one of ${MUTES.join(', ')}`);
    session.unwrap(await session.model.strands.setMuted(strand.id, level));
  },
};

const archive: Command = {
  name: 'archive',
  summary: 'Hide a strand from the list (nothing changes for anyone else)',
  usage: '<strand>',
  async run(session, args) {
    const strand = await session.strand(need(archive, args, 0, 'strand'));
    session.unwrap(await session.model.strands.setArchived(strand.id, true));
  },
};

const unarchive: Command = {
  name: 'unarchive',
  summary: 'Show an archived strand in the list again',
  usage: '<strand>',
  async run(session, args) {
    const strand = await session.strand(need(unarchive, args, 0, 'strand'));
    session.unwrap(await session.model.strands.setArchived(strand.id, false));
  },
};

const leave: Command = {
  name: 'leave',
  summary: 'Leave a strand; --forget also discards who you were in it',
  usage: '<strand> [--forget] [--yes]',
  options: { forget: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' } },
  async run(session, args, values) {
    const strand = await session.strand(need(leave, args, 0, 'strand'));
    const key = values.forget ? 'strand.forgetBody' : 'strand.leaveBody';
    session.out.note(session.t(key));
    if (!values.yes && !(await session.confirm(`${values.forget ? 'Forget' : 'Leave'} "${strand.title}"?`))) {
      throw new UsageError('leave: not confirmed (use --yes when nobody is at the terminal)');
    }
    session.unwrap(await session.model.strands.leave(strand.id, { keepIdentity: !values.forget }));
  },
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export const strandCommands = [strands, log, tail, send, members, mute, archive, unarchive, leave];
