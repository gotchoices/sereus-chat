/**
 * sapp.ts — the chat sApp: its id, version, schema and config, as every app and every
 * machine serving a chat strand must agree on them.
 *
 * The schema's single source is design/specs/domain/chat-sapp.qsql; the build generates
 * `schema.generated.ts` from it (scripts/gen-schema.mjs).
 */
import type { SAppConfig } from '@serfab/cadre-core';
import { CHAT_SCHEMA_QSQL } from './schema.generated.js';

/** sApp ID for the chat app — matches design/specs/project.md. */
export const CHAT_SAPP_ID = 'org.sereus.chat';

export const CHAT_SAPP_VERSION = '0.1.0';

/**
 * Strip `declare schema X { ... }` wrappers and comment lines. StrandDatabase re-wraps
 * the DDL in `declare schema App { ... }; apply schema App;`, so it is handed the inner
 * declarations only.
 */
export function extractInnerDDL(schemaSql: string): string {
  return schemaSql
    .replace(/^\s*--[^\n]*\n/gm, '')
    .replace(/^declare\s+schema\s+\w+\s*\{/m, '')
    .replace(/\}\s*$/, '')
    .trim();
}

/** The schema as StrandDatabase takes it. */
export const CHAT_SCHEMA_DDL = extractInnerDDL(CHAT_SCHEMA_QSQL);

export function getChatSAppConfig(): SAppConfig {
  return {
    id: CHAT_SAPP_ID,
    version: CHAT_SAPP_VERSION,
    schema: CHAT_SCHEMA_DDL,
    // Unsigned. cadre-core verifies schemas fail-closed, so the node is built with
    // `requireSignedSchemas: false`. Signing requires `id` to be an ed25519 author
    // public key rather than the reverse-DNS name above — changing that is an
    // sApp-identity decision, not a config tweak.
    signature: '',
    latencyHint: 'interactive',
  } as SAppConfig;
}
