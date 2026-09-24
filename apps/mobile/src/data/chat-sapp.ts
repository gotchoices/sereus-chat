/**
 * chat-sapp.ts — chat-specific sApp config and strand create/join helpers.
 *
 * The schema lives at design/specs/domain/chat-sapp.qsql and is loaded as a
 * raw string by the Metro transformer (see metro.transformer.js).
 *
 * Lives in the data layer (chat-specific).  The cadre layer reads
 * `CHAT_SAPP_ID` from here for `strandFilter` configuration — that single
 * import is the only chat → cadre coupling and is flagged for replacement
 * with a configure(sAppId) call at extraction time.
 *
 * Mirrors the pattern in:
 *   sereus/packages/reference-app-rn/src/chat-strand.ts
 *   ser/health/apps/mobile/src/services/CadreService.ts (extractInnerDDL)
 */

import type {
  CadreNode,
  StrandInstance,
  SAppConfig,
  StrandRow,
} from '@serfab/cadre-core';
import { generateStrandMemberKey } from '@serfab/cadre-core';

// Raw .qsql contents, imported as a string by the Metro transformer.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — .qsql is a custom Metro source extension; no .d.ts shipped.
import CHAT_SCHEMA_RAW from '../../../../design/specs/domain/chat-sapp.qsql';
import type { Visibility } from './types';

/** sApp ID for the chat app — matches design/specs/project.md. */
export const CHAT_SAPP_ID = 'org.sereus.chat';

const SAPP_VERSION = '0.1.0';

/**
 * Strip `declare schema X { ... }` wrappers if present.  StrandDatabase
 * re-wraps the DDL in `declare schema App { ... }; apply schema App;`, so
 * we hand it the inner declarations only.
 */
function extractInnerDDL(schemaSql: string): string {
  return schemaSql
    .replace(/^\s*--[^\n]*\n/gm, '')
    .replace(/^declare\s+schema\s+\w+\s*\{/m, '')
    .replace(/\}\s*$/, '')
    .trim();
}

const CHAT_SCHEMA_DDL = extractInnerDDL(CHAT_SCHEMA_RAW as string);

export function getChatSAppConfig(): SAppConfig {
  return {
    id: CHAT_SAPP_ID,
    version: SAPP_VERSION,
    schema: CHAT_SCHEMA_DDL,
    // Unsigned.  cadre-core 0.8 verifies this fail-closed, so CadreService
    // sets `requireSignedSchemas: false`.  Signing requires `id` to be an
    // ed25519 author public key rather than the reverse-DNS name below —
    // changing that is an sApp-identity decision, not a config tweak.
    signature: '',
    latencyHint: 'interactive',
  } as SAppConfig;
}

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
