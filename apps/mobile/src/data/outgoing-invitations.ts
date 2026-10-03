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
 * WHAT "TAKEN UP" MEANS HERE. Exactly what the party's control database says:
 * redeeming an invitation records a `FormationUsage` row against its token, so an
 * invitation is taken up once that count is non-zero — per invitation, which
 * matters for a strand with several out at once. Only when the control database
 * cannot be read does it fall back to the strand's member count at the time the
 * invitation was made (an arrival then retires every invitation for that strand,
 * erring towards hiding, never towards inventing activity).
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
 * Still-outstanding invitations, newest first. Drops expired and spent ones from
 * storage as well as the result.
 *
 * `usage` answers from the control database: how many have joined through it, or
 * null when it cannot be read. An invitation for one person is spent at its first
 * use. One for anyone stays until it expires, carrying its count. On null,
 * `memberCount` is the fallback for a one-person invitation, itself null when the
 * strand cannot be read either, and an invitation nothing is known about is kept.
 */
export async function listOutgoingInvitations(
  usage: (inv: OutgoingInvitation) => Promise<number | null>,
  memberCount: (strandId: string) => Promise<number | null>,
): Promise<OutgoingInvitation[]> {
  const list = await load();
  const now = Date.now();
  const keep: OutgoingInvitation[] = [];
  for (const inv of list) {
    if (inv.expiresAt && Date.parse(inv.expiresAt) <= now) continue;
    // Remembered by an older build: those were treated as one-person invitations.
    const singleUse = inv.singleUse ?? true;
    const used = await usage(inv);
    if (singleUse) {
      if (used !== null && used > 0) continue;
      if (used === null && inv.strandId) {
        const count = await memberCount(inv.strandId);
        if (count !== null && count > inv.membersAtMint) continue;
      }
      keep.push(inv);
    } else {
      keep.push(used === null ? inv : { ...inv, uses: used });
    }
  }
  const stored = keep.map(({ uses: _uses, ...rest }) => rest);
  if (stored.length !== list.length) await save(stored as OutgoingInvitation[]);
  return keep.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
