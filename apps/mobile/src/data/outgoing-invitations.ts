/**
 * outgoing-invitations.ts — the invitations this device has handed out and not
 * yet seen taken up.
 *
 * WHY LOCAL. An invitation's redeemability lives in a `FormationInvite` row in
 * the control database, keyed by its raw token; the ENCODED invitation that is
 * actually shared (the link and QR) is not recoverable from that row. So the
 * only place that can re-share one is the device that minted it, and this is
 * where it keeps them. Story 02 path D: "He can see it is still outstanding, and
 * can share it again or abandon it."
 *
 * WHAT "TAKEN UP" MEANS HERE. Nothing tells the inviter which invitation was
 * redeemed, so each record carries the strand's member count when it was made,
 * and the invitation stops being listed once the strand has more members than
 * that. For a new strand that is exact; for a strand with several invitations
 * out at once, whichever arrival comes first retires all of them from the list —
 * a known approximation, erring towards hiding, never towards inventing activity.
 *
 * WHAT "FORGET" DOES NOT DO. Removing a record here stops listing it; it does
 * not withdraw the invitation. The control schema supports an owner-signed
 * delete of the `FormationInvite` row, but cadre-core exposes no call for it
 * yet, so an invitation that has been forgotten here still works for whoever
 * holds it until it expires. The screen says so rather than calling it
 * "abandoned".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Invitation } from './types';

const KEY = '@sereus.chat/outgoingInvitations';

export type OutgoingInvitation = Invitation & {
  /** Members in the strand when this invitation was made. */
  membersAtMint: number;
  /** When it was made, ISO. */
  createdAt: string;
};

async function load(): Promise<OutgoingInvitation[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(list: OutgoingInvitation[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function rememberOutgoingInvitation(inv: OutgoingInvitation): Promise<void> {
  const list = await load();
  await save([...list.filter(i => i.id !== inv.id), inv]);
}

export async function forgetOutgoingInvitation(id: string): Promise<void> {
  const list = await load();
  await save(list.filter(i => i.id !== id));
}

/**
 * Still-outstanding invitations, newest first. Drops expired ones, and ones
 * whose strand has gained a member since, from storage as well as the result.
 * `memberCount` returns null when the strand cannot be read right now; such an
 * invitation is kept, since nothing is known about it.
 */
export async function listOutgoingInvitations(
  memberCount: (strandId: string) => Promise<number | null>,
): Promise<OutgoingInvitation[]> {
  const list = await load();
  const now = Date.now();
  const keep: OutgoingInvitation[] = [];
  for (const inv of list) {
    if (inv.expiresAt && Date.parse(inv.expiresAt) <= now) continue;
    if (inv.strandId) {
      const count = await memberCount(inv.strandId);
      if (count !== null && count > inv.membersAtMint) continue;
    }
    keep.push(inv);
  }
  if (keep.length !== list.length) await save(keep);
  return keep.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
