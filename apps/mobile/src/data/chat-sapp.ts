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
 * Create a new open chat strand on the given cadre node.
 *
 * Prescribed order (sereus reference-app-rn/src/chat-strand.ts):
 *   1. `publishStrand` — the authority-signed `Strand` row in the control DB.
 *      This is what makes the strand discoverable/joinable by anyone else.
 *   2. `addStrand`     — start the LOCAL strand instance.  `founder: true`
 *      runs the one-time membership bootstrap (writes `Strand.Header`).
 *
 * `mode` is deliberately NOT pinned to `'bootstrap'` any more.  Since 0.8,
 * CadreNode infers it from cohort membership — `bootstrap` while we're a solo
 * node with no other `CadrePeer` rows, `networked` once the cohort has other
 * members.  Hardcoding `'bootstrap'` would keep the strand solo forever.
 *
 * Step 1 is fail-soft.  Publishing needs authority genesis to have succeeded
 * and, in solo mode, writes to the control DB do not reliably survive a
 * restart (tmp/cadre-key-recovery-upstream.md §1) — so a re-created default
 * strand may attempt to publish a row that already exists.  The local strand
 * must still come up in both cases, otherwise the app cannot boot at all.
 * A failure here means "not shareable yet", not "broken".
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

  try {
    await cadreNode.publishStrand(strandId, 'o');
  } catch (err) {
    console.warn(
      `[chat-sapp] publishStrand(${strandId}) failed — strand will be local-only ` +
        'until it can be published (needs authority genesis + a reachable cohort):',
      err,
    );
  }

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
 * Optimystic sync.  No `mode` — inferred, as above.
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
