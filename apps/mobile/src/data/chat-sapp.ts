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
import { withTimeout, CONTROL_OP_TIMEOUT_MS } from '../cadre/async';

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
 * Order matters, and it is the REVERSE of the sereus reference app.  The
 * reference publishes first (authority-signed `Strand` row in the control DB)
 * so it never starts a local-only island.  Chat is offline-first: the default
 * "My Notes" strand must attach and be usable on a solo device with no cohort,
 * and a control-DB write blocks on the network transactor until a cohort
 * exists (see CadreService.armCadreServicesInBackground).  So we:
 *   1. `addStrand` — start the LOCAL strand instance (`founder: true` runs the
 *      one-time membership bootstrap).  This works solo: the strand DB runs in
 *      bootstrap mode against its own LevelDB, no control network required.
 *   2. `publishStrand` — best-effort, in the BACKGROUND, to make the strand
 *      discoverable once the cadre has other members.  A failure/timeout here
 *      means "not shareable yet", never "boot hung".
 *
 * `mode: 'bootstrap'` is pinned deliberately.  If it is omitted, 0.8 INFERS the
 * mode from cohort membership — which reads `CadrePeer` from the control DB,
 * and that read blocks forever on a solo node (the network transactor has no
 * quorum).  Bootstrap mode skips the cohort read and runs the strand purely
 * against its own LevelDB.  A strand that needs `networked` mode (once a cohort
 * exists) is restarted then — a future step; see STATUS.md "First remote node".
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

  // `addStrand` is time-boxed: on 0.8 it ALWAYS reads `CadrePeer` from the
  // control DB (launchStrand → resolveCohortSeed → queryCadrePeers) to resolve
  // the cohort seed, even with `mode: 'bootstrap'`, and that read blocks on a
  // solo node.  The timeout keeps a solo attempt from hanging the caller
  // forever; it resolves promptly once the cadre has a reachable peer.
  const instance = await withTimeout(
    cadreNode.addStrand({
      mode: 'bootstrap',
      strandRow,
      sAppConfig: getChatSAppConfig(),
      founder: true,
    }),
    CONTROL_OP_TIMEOUT_MS,
    'addStrand',
  );

  // Best-effort publish, off the attach path.  Time-boxed so a solo control
  // write (which never acknowledges without a cohort) can't leave a dangling
  // await; the strand is already attached and usable regardless.
  void withTimeout(cadreNode.publishStrand(strandId, 'o'), CONTROL_OP_TIMEOUT_MS, 'publishStrand').catch(
    err =>
      console.warn(
        `[chat-sapp] publishStrand(${strandId}) deferred — strand is local-only until ` +
          'authority genesis completes and a cohort is reachable:',
        err instanceof Error ? err.message : err,
      ),
  );

  return instance;
}

/**
 * Join an existing chat strand that surfaced via the control network.
 *
 * No `founder` — a joiner writes no membership rows; it receives them via
 * Optimystic sync.  `mode: 'bootstrap'` for the same reason as createChatStrand
 * (avoid the solo-hanging cohort read).
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
