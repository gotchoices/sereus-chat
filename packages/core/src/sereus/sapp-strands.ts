/**
 * sapp-strands.ts — create and join chat strands on this device's node.
 *
 * The sApp itself (id, version, schema, config) is protocol (`../protocol`).
 *
 * Mirrors the pattern in sereus/packages/reference-app-rn/src/chat-strand.ts.
 */

import type {
  CadreNode,
  StrandInstance,
  StrandRow,
} from '@serfab/cadre-core';
import { generateStrandMemberKey } from '@serfab/cadre-core';
import { getChatSAppConfig } from '../protocol/index.js';
import type { Visibility } from '../model/index.js';

/**
 * A freshly founded strand plus the membership key an invitation into it must
 * carry. `memberPrivateKey` is null for an OPEN strand, which gates nothing.
 */
export type CreatedStrand = {
  instance: StrandInstance;
  memberPrivateKey: string | null;
};

/**
 * Create a chat strand of the requested type.
 *
 * PRIVATE means a CLOSED strand (`type: 'c'`) with a generated membership key —
 * the shape `reference-app-rn`'s `createClosedChatStrand` uses for invited chat,
 * and the one upstream's blind-relay phone-to-phone scenario exercises end to
 * end.  The key is the read-gating secret: the formation protocol hands it to a
 * joiner after consent, and cadre-core issues a single-use `Strand.Invite` only
 * for a closed strand that has one.
 *
 * PUBLIC means an OPEN strand (`type: 'o'`): no key, no gate, anyone holding a
 * link can participate and nobody can be removed — exactly what that option
 * promises on the invitation screen.
 *
 * The type is fixed at founding and there is no later act that closes an open
 * strand, so the user's choice has to reach THIS call or it means nothing.  We
 * previously founded every strand open and then attached the joined row as
 * closed with a null key, which is a strand nobody can read.
 *
 * ONE CALL, not publish-then-attach.  `foundStrand` is the sanctioned founder
 * path as of cadre-core 0.13.0 and does both steps resumably, which matters
 * beyond tidiness: the two-step form could lose a race and leave the strand
 * HEADERLESS.  If anything else attached it first — a `strand:discovered`
 * handler after a restart, or the node's own StrandWatcher poll — the founder
 * bootstrap that writes `Strand.Header` was silently skipped, and a headerless
 * strand admits nobody and never settles.  `foundStrand` resolves founder-ness
 * FROM THE ROW (this machine founds iff the row's `FounderOwnerKey` is its own
 * owner key) and runs the idempotent founder bootstrap even on an instance
 * something else attached, so the Header is written either way.
 */
export async function createChatStrand(
  cadreNode: CadreNode,
  strandId: string,
  visibility: Visibility = 'private',
): Promise<CreatedStrand> {
  // `founded: false` is a correct outcome, not a failure: it means a sibling
  // machine won the founding race and we attached as a joiner, which is what
  // avoids two machines bootstrapping one strand (the double-Header hazard).
  const closed = visibility === 'private';

  const { instance, strandRow, founded } = await cadreNode.foundStrand({
    strandId,
    // THE TYPE IS DECIDED HERE, and only here. A strand's type is fixed when it
    // is founded — there is no later act that closes an open strand — so the
    // user's Private/Open choice has to reach this call or it means nothing.
    type: closed ? 'c' : 'o',
    // A closed strand's read-gating secret. Without it the strand is closed to
    // everyone including its own invitees: the membership key is what an
    // invitation carries, and cadre-core issues no membership invite for a
    // strand that has none.
    ...(closed ? { memberPrivateKey: await generateStrandMemberKey() } : {}),
    sAppConfig: getChatSAppConfig(),
  });

  if (closed && !strandRow.MemberPrivateKey) {
    // Loud, like the reference app's equivalent check. A closed strand whose
    // control row carries no membership key can never issue a usable invitation,
    // and the failure would otherwise appear much later, on someone else's phone.
    throw new Error(
      `Closed chat strand ${strandId} was founded without a MemberPrivateKey — ` +
        'no invitation into it could ever be read',
    );
  }

  console.info(
    `[chat-sapp] ${founded ? 'founded' : 'attached (a sibling founded it)'} ` +
      `${closed ? 'closed' : 'open'} strand: ${strandId}`,
  );
  return { instance, memberPrivateKey: strandRow.MemberPrivateKey ?? null };
}

/**
 * Found a chat strand and return once it is PUBLISHED (sereus 1.17, `foundStrand` with
 * `{ background: true }`, gotchoices/sereus#49): the row and its membership key exist, which
 * is all minting an invitation needs, while the strand node starts in `ready`.
 */
export async function foundChatStrandInBackground(
  cadreNode: CadreNode,
  strandId: string,
  visibility: Visibility = 'private',
): Promise<{ strandId: string; ready: Promise<StrandInstance> }> {
  const closed = visibility === 'private';
  const { strandRow, ready } = await cadreNode.foundStrand({
    strandId,
    type: closed ? 'c' : 'o',
    ...(closed ? { memberPrivateKey: await generateStrandMemberKey() } : {}),
    sAppConfig: getChatSAppConfig(),
  }, { background: true });
  if (closed && !strandRow.MemberPrivateKey) {
    throw new Error(`Closed chat strand ${strandId} was founded without a MemberPrivateKey — no invitation into it could ever be read`);
  }
  console.info(`[chat-sapp] founded ${closed ? 'closed' : 'open'} strand: ${strandId} (starting in the background)`);
  return { strandId: strandRow.Id, ready };
}

/**
 * Join an existing chat strand that surfaced via the control network.
 *
 * No `founder` — a joiner writes no membership rows; it receives them via
 * Optimystic sync.  `mode` unset — inferred from cohort membership.
 */
export async function joinChatStrand(
  cadreNode: CadreNode,
  strandRow: StrandRow,
  opts: { deriveFounder?: boolean } = {},
): Promise<StrandInstance> {
  return cadreNode.addStrand({
    strandRow,
    sAppConfig: getChatSAppConfig(),
    // `founder: false` is EXPLICIT for a consent-seated row, and OMITTED when the
    // row carries real founder provenance — the difference matters more than it
    // looks, because cadre-core documents that "an explicit true/false wins over
    // the derivation".
    //
    // A row from the formation flow has `FounderOwnerKey: null`, which matches
    // nobody, so the derivation would make a joiner a non-founder by accident
    // rather than on purpose; those callers pass `false` deliberately.
    //
    // But a row that came from the CONTROL NETWORK carries the real founder key,
    // and forcing `false` there tells this node it is a joiner OF A STRAND IT
    // FOUNDED. A joiner "writes nothing — it receives those rows via Optimystic
    // sync", so the founder skips its own membership bootstrap and waits forever
    // for rows only it could have written. Pass `deriveFounder` for such a row and
    // let cadre-core compare `FounderOwnerKey` to this node's owner key.
    ...(opts.deriveFounder ? {} : { founder: false as const }),
  });
}
