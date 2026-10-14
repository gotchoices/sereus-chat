/**
 * Respond to an invitation (RN: InvitationAcceptance, story 03): who invites, what the
 * strand is, what joining means, then Join or No thanks. The words are the shared
 * catalog's (`@chat/resources`), so both apps say the same thing.
 */
import { Frame, Observable, type EventData, type Page } from '@nativescript/core';
import { strandStatusKind } from '@chat/core';
import { errorText } from '@chat/resources';
import { model, t } from '../src/model';

class InvitationModel extends Observable {
  headline = '';
  status = '';
  history = t('accept.history');
  problem = '';
  ready = false;
  busy = true;
  acceptLabel = t('accept.accept');
  declineLabel = t('accept.decline');

  constructor(private readonly token: string) {
    super();
    void this.inspect();
  }

  private async inspect() {
    const r = await model.invitations.inspect(this.token);
    this.set('busy', false);
    if (!r.ok) { this.set('problem', errorText(t, r.error)); return; }
    const p = r.value;
    if (p.status !== 'live') { this.set('problem', t(`accept.${p.status}`)); return; }
    this.set('headline', p.inviterName ? `${p.inviterName} ${t('accept.invitesYou')}` : `${t('accept.unattributed')} ${t('accept.invitesYouUnattributed')}`);
    const kind = strandStatusKind(p.strandState);
    this.set('status', `${t(`status.strand.${kind}.label`)} — ${t(p.grantsInviteRight ? 'accept.canInvite' : 'accept.cannotInvite')}`);
    this.set('ready', true);
  }

  accept = async () => {
    this.set('busy', true);
    this.set('problem', '');
    this.set('status', t('accept.joining'));
    const r = await model.invitations.accept(this.token);
    this.set('busy', false);
    if (!r.ok) { this.set('problem', errorText(t, r.error)); return; }
    Frame.topmost().navigate({ moduleName: 'chat-page', context: { strandId: r.value.strandId, title: '' }, clearHistory: true });
  };

  decline = () => Frame.topmost().navigate({ moduleName: 'strands-page', clearHistory: true });
}

export function onNavigatingTo(args: EventData & { context?: { token?: string } }) {
  const page = args.object as Page;
  const token = (page.navigationContext as { token?: string } | undefined)?.token ?? '';
  page.bindingContext ??= new InvitationModel(token);
}
