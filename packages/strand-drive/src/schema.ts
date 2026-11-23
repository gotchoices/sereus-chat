/**
 * The drive's schema fragment (SPEC.md, "Tables"): two tables an app includes in its own sApp
 * schema, every name starting with `prefix` so they cannot clash with the app's tables. Nullability
 * is explicit (Quereus defaults columns to NOT NULL).
 */
export const DEFAULT_PREFIX = 'Drive'

export interface DriveSchemaOptions {
  /**
   * The column type of a file's blob reference. `blobref` (the default) is Optimystic's: it pins
   * the bytes when the row commits and keeps them alive while the row exists. `text` is for a
   * database without that type (this module's own tests).
   */
  blobType?: 'blobref' | 'text'
}

export function driveSchema (prefix = DEFAULT_PREFIX, options: DriveSchemaOptions = {}): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(prefix)) throw new Error(`not a table prefix: ${prefix}`)
  const blobType = options.blobType ?? 'blobref'
  if (blobType !== 'blobref' && blobType !== 'text') throw new Error(`not a blob column type: ${String(blobType)}`)
  return `
-- The strand drive (a sereus module's schema fragment; see packages/strand-drive/SPEC.md).
-- A folder. Top-level folders have no parent. Folders never expire.
table ${prefix}Folder (
    Id text primary key,
    ParentId text null,
    Name text not null check (length(Name) between 1 and 200),
    CreatedBy text not null,
    CreatedAt text not null,
    AddPolicy text not null default 'anyone' check (AddPolicy in ('anyone', 'creator'))
) with tags ("optimystic.network_watch" = true, "optimystic.fresh" = true);

-- A file: a name in a folder for a blob (its reference in the strand's blob service), kept
-- until ExpiresAt.
table ${prefix}File (
    Id text primary key,
    FolderId text null,
    Name text not null check (length(Name) between 1 and 255),
    Blob ${blobType} not null,
    Size integer not null check (Size >= 0),
    MimeType text null,
    AddedBy text not null,
    AddedAt text not null,
    ExpiresAt text not null
) with tags ("optimystic.network_watch" = true, "optimystic.fresh" = true);

index ${prefix}FolderByParent on ${prefix}Folder (ParentId, Name);
index ${prefix}FileByFolder on ${prefix}File (FolderId, Name);
`
}
