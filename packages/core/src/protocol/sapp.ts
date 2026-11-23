/**
 * sapp.ts — the chat sApp: its id, version, schema and config, as every app and every
 * machine serving a chat strand must agree on them.
 *
 * The schema's single source is design/specs/domain/chat-sapp.qsql; the build generates
 * `schema.generated.ts` from it (scripts/gen-schema.mjs).
 */
import type { SAppConfig } from '@serfab/cadre-core';
import { driveSchema } from '@chat/strand-drive';
import { CHAT_SCHEMA_QSQL } from './schema.generated.js';

/** sApp ID for the chat app — matches design/specs/project.md. */
export const CHAT_SAPP_ID = 'org.sereus.chat';

/**
 * 0.2.0: `Message.Id` and `Attachment.Id` tagged `optimystic.fresh` (a tag only; rows unchanged).
 * 0.3.0: index `MessageByTime` on `Message (Timestamp, Id)` for the message list (Optimystic#52).
 * 0.4.0: blobs (docs/blobs.md): `Attachment.Blob`, tables `BlobChunk` and `Blob`.
 * 0.5.0: the strand drive (`@chat/strand-drive`): tables `DriveFolder` and `DriveFile`.
 * 0.6.0: files in the stack's blobs (docs/blobs.md): `Attachment.Blob` and `DriveFile.Blob` are
 *        `blobref` columns; `Attachment.Uri` and the chunk tables `BlobChunk` and `Blob` are gone.
 */
export const CHAT_SAPP_VERSION = '0.6.0';

/**
 * Sereus 1.24's schema version (`SAppConfig.schemaVersion`): a whole number raised with EVERY change
 * to the `App` schema. A strand refuses an app whose number is lower than the highest any member
 * has applied (`AppSchemaOutdatedError`), so an older app can never drop what a newer one added.
 * 6 for schema 0.6.0; raise it together with `CHAT_SAPP_VERSION`.
 */
export const CHAT_SCHEMA_VERSION = 6;

/** The drive's tables carry this prefix in chat's schema (`App.DriveFolder`, `App.DriveFile`). */
export const DRIVE_PREFIX = 'Drive';

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

/**
 * The schema as StrandDatabase takes it: chat's own tables (design/specs/domain/chat-sapp.qsql)
 * and the drive module's fragment, merged into one `App` schema.
 */
export const CHAT_SCHEMA_DDL = extractInnerDDL(`${CHAT_SCHEMA_QSQL}
${driveSchema(DRIVE_PREFIX)}`);

export function getChatSAppConfig(): SAppConfig {
  return {
    id: CHAT_SAPP_ID,
    version: CHAT_SAPP_VERSION,
    schemaVersion: CHAT_SCHEMA_VERSION,
    schema: CHAT_SCHEMA_DDL,
    // Unsigned. cadre-core verifies schemas fail-closed, so the node is built with
    // `requireSignedSchemas: false`. Signing requires `id` to be an ed25519 author
    // public key rather than the reverse-DNS name above — changing that is an
    // sApp-identity decision, not a config tweak.
    signature: '',
    latencyHint: 'interactive',
  } as SAppConfig;
}
