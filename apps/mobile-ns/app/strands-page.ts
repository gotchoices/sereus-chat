/**
 * The strand list (RN: StrandList): the core's `strandListStore`, plus a minimal setup
 * strip — the user's name and the relay — since this twin has no profile or network
 * screens of its own.
 */
import { Dialogs, Frame, Observable, type EventData, type ItemEventData, type Page } from '@nativescript/core';
import { reachabilityStore, strandListStore } from '@chat/core';
import { model, pendingInvitation, setPendingInvitation, t } from '../src/model';

class StrandsModel extends Observable {
  who = '';
  reach = '';
  strands: Array<{ id: string; title: string; preview: string }> = [];
  private stops: Array<() => void> = [];

  start() {
    if (this.stops.length) return;
    this.stops.push(strandListStore(model).subscribe(load => {
      const list = load.value?.strands ?? [];
      this.set('strands', list.map(s => ({
        id: s.id,
        title: s.title,
        preview: s.opening || s.pending ? t('strands.connecting') : s.lastMessage?.previewText ?? t('strands.noMessages'),
      })));
    }));
    this.stops.push(reachabilityStore(model).subscribe(load => {
      const r = load.value;
      if (r) this.set('reach', r.reachable ? `Reachable (relay ${r.relayStatus ?? '—'})` : r.relays.length ? 'Not reachable yet — relay connecting' : 'No relay: nobody can reach you');
    }));
    void model.profile.get().then(p => this.set('who', p.ok && p.value.name ? p.value.name : 'No name yet'));
  }

  setName = async () => {
    const r = await Dialogs.prompt({ title: 'Your name', okButtonText: 'Save', cancelButtonText: 'Cancel', defaultText: this.who === 'No name yet' ? '' : this.who });
    if (!r.result || !r.text.trim()) return;
    const current = await model.profile.get();
    await model.profile.save({ ...(current.ok ? current.value : {}), name: r.text.trim() });
    this.set('who', r.text.trim());
  };

  setRelay = async () => {
    const prefs = await model.prefs.get();
    const r = await Dialogs.prompt({ title: 'Relay multiaddr', okButtonText: 'Use', cancelButtonText: 'Cancel', defaultText: prefs.ok ? prefs.value.relayAddrs[0] ?? '' : '' });
    if (!r.result || !r.text.trim()) return;
    await model.prefs.set({ relayAddrs: [r.text.trim()] });
  };

  openStrand = (args: ItemEventData) => {
    const s = this.strands[args.index];
    Frame.topmost().navigate({ moduleName: 'chat-page', context: { strandId: s.id, title: s.title } });
  };

  openDiagnostics = () => Frame.topmost().navigate({ moduleName: 'diagnostics-page' });
}

const vm = new StrandsModel();

export function onNavigatingTo(args: EventData) {
  (args.object as Page).bindingContext = vm;
  vm.start();
}

export function onNavigatedTo() {
  if (pendingInvitation) {
    const token = pendingInvitation;
    setPendingInvitation(null);
    Frame.topmost().navigate({ moduleName: 'invitation-page', context: { token } });
  }
}
