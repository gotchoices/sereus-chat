/** Invitations: `invite`, `invites`, `invite cancel`, `join`. */
import {
  INVITATION_VALIDITY,
  defaultInvitationTerms,
  parseInviteToken,
  strandStatusKind,
  type InvitationValidity,
} from '@chat/core';
import { writeFile } from 'node:fs/promises';
import { CliFailure, EXIT, UsageError } from '../session.js';
import { resolveRef } from '../refs.js';
import { need, type Command } from './command.js';

const INVITE_COLUMNS = ['id', 'url', 'expiresAt'] as const;

const invite: Command = {
  name: 'invite',
  summary: 'Make an invitation (to a new strand unless --strand); "invite cancel <id>" withdraws one',
  usage: '[--strand <strand>] [--public] [--manager] [--multi] [--valid day|week|month] [-o <file>] | cancel <id|row>',
  options: {
    strand: { type: 'string' },
    public: { type: 'boolean' },
    manager: { type: 'boolean' },
    multi: { type: 'boolean' },
    valid: { type: 'string' },
    out: { type: 'string', short: 'o' },
  },
  async run(session, args, values) {
    if (args[0] === 'cancel') {
      const outstanding = session.unwrap(await session.model.invitations.listOutstanding());
      const target = resolveRef(need(invite, args, 1, 'invitation'), outstanding, outstanding.map(i => i.id), 'invitation');
      session.unwrap(await session.model.invitations.cancel(target.id));
      return;
    }
    if (args.length) throw new UsageError(`invite: unexpected ${JSON.stringify(args[0])}\nusage: invite ${invite.usage}`);
    const visibility = values.public ? 'public' : 'private';
    const terms = defaultInvitationTerms(visibility);
    const validity = (values.valid ?? terms.validity) as InvitationValidity;
    if (!(validity in INVITATION_VALIDITY)) throw new UsageError(`invite: --valid is one of ${Object.keys(INVITATION_VALIDITY).join(', ')}`);
    const strandId = typeof values.strand === 'string' ? (await session.strand(values.strand)).id : undefined;
    if (values.manager) session.out.note(session.t('invite.rightsBody'));
    const made = session.unwrap(await session.model.invitations.create({
      strandId,
      visibility,
      grantsInviteRight: !!values.manager,
      singleUse: values.multi ? false : terms.singleUse,
      validForMs: INVITATION_VALIDITY[validity],
    }));
    // The link alone, for a QR tool or another program. Owner-only: whoever has it can use it.
    if (typeof values.out === 'string') await writeFile(values.out, `${made.url}\n`, { mode: 0o600 });
    session.out.rows(INVITE_COLUMNS, [{ id: made.id, url: made.url, expiresAt: made.expiresAt }]);
  },
};

const invites: Command = {
  name: 'invites',
  noArgs: true,
  summary: 'List outstanding invitations',
  usage: '',
  async run(session) {
    const outstanding = session.unwrap(await session.model.invitations.listOutstanding());
    session.out.rows(['row', 'id', 'strandId', 'expiresAt', 'uses', 'url'], outstanding.map((inv, i) => ({
      row: i + 1, id: inv.id, strandId: inv.strandId, expiresAt: inv.expiresAt, uses: inv.uses ?? 0, url: inv.url,
    })));
  },
};

const join: Command = {
  name: 'join',
  summary: 'Accept an invitation link: shows what it is and asks first',
  usage: '<link|token> [--yes]',
  options: { yes: { type: 'boolean', short: 'y' } },
  async run(session, args, values) {
    const text = need(join, args, 0, 'invitation link');
    const token = parseInviteToken(text) ?? text;
    const preview = session.unwrap(await session.model.invitations.inspect(token));
    if (preview.status !== 'live') {
      const key = { spent: 'accept.spent', expired: 'accept.expired', cancelled: 'accept.cancelled', invalid: 'accept.invalid' }[preview.status];
      throw new CliFailure(session.t(key), EXIT.failed);
    }
    const kind = strandStatusKind(preview.strandState);
    session.out.note([
      preview.inviterName ? `${preview.inviterName} ${session.t('accept.invitesYou')}` : `${session.t('accept.unattributed')} ${session.t('accept.invitesYouUnattributed')}`,
      `${session.t(`status.strand.${kind}.label`)}: ${session.t(`status.strand.${kind}.sentence`, undefined, {
        who: preview.strandState.managerCount === 1 ? session.t('status.strand.canChange.one')
          : session.t('status.strand.canChange.many', undefined, { n: preview.strandState.managerCount }),
        you: session.t('status.strand.canChange.youRemovable'),
      })}`,
      session.t(preview.grantsInviteRight ? 'accept.canInvite' : 'accept.cannotInvite'),
      session.t('accept.history'),
    ].join('\n'));
    if (!values.yes && !(await session.confirm(session.t('accept.accept') + '?'))) {
      throw new UsageError('join: not confirmed (use --yes when nobody is at the terminal)');
    }
    const { strandId } = session.unwrap(await session.model.invitations.accept(token));
    session.out.rows(['strandId'], [{ strandId }]);
  },
};

export const inviteCommands = [invite, invites, join];
