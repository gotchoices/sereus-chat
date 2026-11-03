/**
 * private-sapp.ts — the party's PRIVATE strand: one closed strand per party that nobody is
 * ever invited into, so its data reaches only this person's own machines (the pattern
 * suggested in gotchoices/sereus#24). Other members can neither read it nor see it change.
 *
 * MEASUREMENT STAGE (2026-11-02). Only a `Label` table, written and read to time it; nothing
 * in the app uses it yet. Whether it is worth its running cost (one more strand node and
 * relay reservation) is what the measurement is for.
 *
 * Its id is DERIVED from the party id, so every machine of the party recognizes it without
 * a record of its own (the control `Strand` row does not say which sApp a strand runs) and
 * two machines cannot found two. Unlike a minted id it is predictable to whoever knows the
 * party id. That exposes the strand's network name, not its content: it is closed, and only
 * this party can write its control row.
 */
import type { SAppConfig } from '@serfab/cadre-core';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const PRIVATE_SAPP_ID = 'org.sereus.chat.private';
export const PRIVATE_SAPP_VERSION = '0.1.0';

/** The private strand's schema, inner declarations only (as `CHAT_SCHEMA_DDL`). */
export const PRIVATE_SCHEMA_DDL = `table Label (
    Key text primary key,
    Text text not null,
    UpdatedAt text not null
) with tags ("optimystic.network_watch" = true);`;

export function getPrivateSAppConfig(): SAppConfig {
  return {
    id: PRIVATE_SAPP_ID,
    version: PRIVATE_SAPP_VERSION,
    schema: PRIVATE_SCHEMA_DDL,
    signature: '', // unsigned, as the chat sApp (`requireSignedSchemas: false`)
    latencyHint: 'interactive',
  } as SAppConfig;
}

/** `strand-` plus 32 hex characters, the shape cadre-core mints, from the party id. */
export function privateStrandId(partyId: string): string {
  return `strand-${bytesToHex(sha256(utf8ToBytes(`${PRIVATE_SAPP_ID}\n${partyId}`))).slice(0, 32)}`;
}
