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
    // Signature placeholder — chat uses open strands today (Type: 'o').
    // Closed/signed strands will populate this when wired up.
    signature: '',
    latencyHint: 'interactive',
  } as SAppConfig;
}

/**
 * Create a new chat strand on the given cadre node.
 *
 * `mode: 'bootstrap'` skips consensus round-trips that can't complete with
 * zero peers — schema apply / DML route through the local optimystic
 * transactor backed by the strand's own LevelDB store.  Solo-mode by design;
 * a future step will restart strands in 'networked' mode once peers attach.
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

  return cadreNode.addStrand({
    mode: 'bootstrap',
    strandRow,
    sAppConfig: getChatSAppConfig(),
  });
}

/**
 * Join an existing chat strand that surfaced via the control network.
 */
export async function joinChatStrand(
  cadreNode: CadreNode,
  strandRow: StrandRow,
): Promise<StrandInstance> {
  return cadreNode.addStrand({
    mode: 'bootstrap',
    strandRow,
    sAppConfig: getChatSAppConfig(),
  });
}
