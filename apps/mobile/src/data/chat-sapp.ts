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

// Raw .qsql contents, imported as a string by the Metro transformer.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — .qsql is a custom Metro source extension; no .d.ts shipped.
import CHAT_SCHEMA_RAW from '../../../../design/specs/domain/chat-sapp.qsql';

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
 * Create a new open chat strand on the given cadre node — the reference-app
 * order (reference-app-rn/src/chat-strand.ts, cadre-core 0.10):
 *   1. `publishStrand(id, 'o')` — the owner-signed `Strand` row in the control
 *      DB.  Published FIRST so a publish failure surfaces as a thrown error and
 *      we never start a local-only island no peer could ever join.
 *   2. `addStrand({ founder: true })` — start the LOCAL strand instance; the
 *      founder bootstrap writes `Strand.Header`.  `mode` is left unset so
 *      CadreNode infers bootstrap→networked from cohort membership.
 *
 * At 0.10 the solo control path completes in ms, so — unlike the 0.8 stack chat
 * previously ran — neither step needs a timeout or backgrounding.  (Requires
 * owner genesis to have run so publishStrand has a signing key; CadreService
 * awaits genesis before this is reached.)
 */
export async function createChatStrand(
  cadreNode: CadreNode,
  strandId: string,
): Promise<StrandInstance> {
  const strandRow: StrandRow = {
    Id: strandId,
    MemberPrivateKey: null,
    Type: 'o', // open — strand type is the user's choice; default to open
  };

  await cadreNode.publishStrand(strandId, 'o');

  return cadreNode.addStrand({
    strandRow,
    sAppConfig: getChatSAppConfig(),
    founder: true,
  });
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
): Promise<StrandInstance> {
  return cadreNode.addStrand({
    strandRow,
    sAppConfig: getChatSAppConfig(),
  });
}
