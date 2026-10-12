/**
 * Reachability: can anybody answer an invitation from this device, which relays it is
 * configured with, and whether the relay reservation holds — read live, because a
 * configured relay is not a working one and a reservation can be lost after it was
 * granted. Re-read when the device's addresses change; a slow backstop poll covers a
 * change no event announces.
 */
import type { ChatModel, Reachability } from '../model/index.js';
import { ok } from '../model/index.js';
import { loader, type Loader } from './loader.js';

export function reachabilityStore(model: ChatModel): Loader<Reachability> {
  return loader<Reachability>({
    load: async () => ok(await model.reachability.get()),
    changes: onChange => model.changes.reachability(onChange),
    debounceMs: 250,
    pollMs: 30_000,
  });
}

/** Outstanding invitations this device made, optionally for one strand (story 02 path D). */
export function outstandingInvitationsStore(model: ChatModel, strandId?: string | null) {
  return loader({
    async load() {
      const all = await model.invitations.listOutstanding();
      if (!all.ok) return all;
      return ok(all.value.filter(i => i.direction !== 'incoming' && (strandId === undefined || i.strandId === strandId)));
    },
  });
}

/**
 * The cadre: this device, its other machines, and whether it is an enrolled owner. Re-read
 * when the control network connects or drops; a slow backstop poll catches machines
 * added or removed elsewhere.
 */
export function cadreManagerStore(model: ChatModel) {
  return loader({
    load: () => model.cadre.status(),
    changes: onChange => model.changes.cadre(onChange),
    pollMs: 30_000,
  });
}
