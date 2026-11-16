# Drive: a strand's shared folders and files (spec)

A strand's drive is a tree of folders and files that every member of the strand sees and can add to.
The structure (folders, names, who added what, until when) is rows in the strand's database; the
bytes of each file are a blob on IPFS-on-a-strand (`packages/strand-blobs`), named by its CID.

This spec lives with the module, not with any app: the drive is meant to become a **sereus module**
that any sApp can include (gotchoices/sereus#62), and the spec leaves with it. Chat is the first user,
through its story 23 (`design/stories/mobile/23-a-shared-drive.md` in sereus-chat). The drive's
purpose decides its shape:

- **A schema fragment, merged into the app's schema.** Sereus applies one schema per strand (chat's
  is `App`, see `chat-sapp.qsql`), so the drive does not get a schema of its own. It is a fragment
  of tables the app includes in its schema. Every table name starts with a **prefix**, `Drive` by
  default, so the drive cannot collide with the app's own tables. An app that already has a
  `DriveFolder` picks another prefix, and the module's queries take the prefix as a parameter.
- **No reference into the app's tables.** Members are named by the same id the app's member rows
  use (in chat, `App.Member.Id`, a peer id), as plain text. The drive reads nothing else of the app.
- **Bytes elsewhere.** A file row holds a blob reference. The drive's code keeps each referenced blob
  alive while its row is live, and lets it go when the row expires or is removed. It never stores
  bytes in the database.

## Tables

The prefix is shown as `Drive`. Ids are fresh random UUIDs made by the writer, which lets the stack
judge an add `assured` in offline mode (as `Message.Id`). Times are ISO 8601 UTC strings, asserted
by the writer's clock, as everywhere in chat. Nullability is explicit, as Quereus defaults columns
to NOT NULL.

```sql
-- A folder. Top-level folders have no parent. Folders never expire: they go when their creator
-- removes them (see the rules).
table DriveFolder (
    Id text primary key,                  -- fresh UUID
    ParentId text null,                   -- the containing folder; null at the top
    Name text not null check (length(Name) between 1 and 200),
    CreatedBy text not null,              -- member id of the creator
    CreatedAt text not null,
    -- Who may add files and folders directly in it: 'anyone' (any member) or 'creator'.
    AddPolicy text not null default 'anyone' check (AddPolicy in ('anyone', 'creator'))
) with tags ("optimystic.network_watch" = true, "optimystic.fresh" = true);

-- A file: a name in a folder for a blob, kept until a date.
table DriveFile (
    Id text primary key,                  -- fresh UUID
    FolderId text null,                   -- the folder; null at the top
    Name text not null check (length(Name) between 1 and 255),
    Blob text not null,                   -- the bytes: an IPFS ref, 'ipfs:<CID>'
    Size integer not null check (Size >= 0),
    MimeType text null,
    AddedBy text not null,                -- member id of whoever added it
    AddedAt text not null,
    ExpiresAt text not null               -- after this the file is gone for everyone (see Lifetime)
) with tags ("optimystic.network_watch" = true, "optimystic.fresh" = true);

index DriveFolderByParent on DriveFolder (ParentId, Name);
index DriveFileByFolder on DriveFile (FolderId, Name);
```

**Deliberately absent:**
- **No uniqueness on a name within a folder.** Two members adding `minutes.pdf` to the same
  folder at the same moment both succeed, and the folder then holds two files of that name. The
  UI tells them apart by who added each, when, and a short fingerprint of its content (the CID's
  last characters). Nothing is ever overwritten, and two concurrent adds cannot conflict.
- **No path column.** A file names its folder and a folder its parent. Moving or renaming a folder
  is one row changed, not every row beneath it.
- **No foreign keys** from a file to its folder, or from a folder to its parent. A member may see
  a file before the folder holding it has arrived (rows replicate independently). The UI shows such
  a file at the top level until its folder arrives.
- **No versions.** To revise a file, its author adds the new one and removes the old. Old content
  is not kept by the drive (but see "Removal").

## Rules

Who may do what. Each member's app applies these rules both to what it writes and to what it
shows: a row written against the rules is ignored, not displayed. This is how chat treats
authorship today (a member edits and deletes only their own messages). Enforcing the rules in the
schema needs signed mutation context (`with context`, the writer's key and a signature checked
against the member's key). That is the hardening path once sereus exposes members' keys to checks,
and the spec reserves it without depending on it.

| Act | Who |
|---|---|
| See the drive, open a file | every member of the strand |
| Add a file or folder at the top level | every member |
| Add a file or folder inside a folder | every member if the folder's `AddPolicy` is `anyone`; only its creator if `creator` |
| Rename or move a file | its author (`AddedBy`), into a folder where they may add |
| Rename or move a folder | its creator, into a folder where they may add, and never into itself or below it |
| Change a folder's `AddPolicy` | its creator |
| Remove a file | its author; anyone, once it has expired |
| Remove a folder | its creator, when it holds nothing of anyone else's |
| Keep a file longer (extend `ExpiresAt`) | any member |

Managers of the strand (who add and remove members) have no extra power over the drive. Moderation
(a manager removing someone else's file) is left open.

**A cycle from concurrent moves.** Two members' concurrent moves can make a folder its own ancestor
(A moved into B while B is moved into A). Rows don't prevent it. Every app breaks the cycle the same
way: whichever folder in the cycle has the smallest `Id` is shown at the top level, and the creator
of that folder is offered to move it back. The rows stay as written. This only affects how the
tree is shown, so all members see the same tree and nothing has to be rewritten.

## Lifetime

Files expire on their own:
- **Choosing when.** When adding a file, the author chooses how long it is kept: a day, a week, a
  month (the default), or a year. `ExpiresAt` is the add time plus that.
- **Keeping it longer.** Any member can keep a file longer by choosing a new period from now
  (`ExpiresAt` only moves later). Keeping a useful file shouldn't depend on its author still being
  around.
- **Expiry.** Past `ExpiresAt`, every app stops showing the file. Any member's app may then remove
  the row, and each member's blob layer lets the bytes go at its next gc.

Folders don't expire. An empty folder stays until its creator removes it.

## Removal

Removing a file or folder takes it out of every member's drive as the row deletion replicates, and
each member's blob layer lets the bytes go. Removal does not reach copies made outside the drive: a
member may have saved, exported or forwarded the file, and any member's device may hold a cached
copy until its gc runs. The UI says so when a member removes something (as chat's story 13 does for
messages): "Removed from the drive. Anyone who already has a copy keeps it."

## Operations (the module's surface)

The operations an app calls. `prefix` is configured once, and member ids come from the app.

| Operation | Effect |
|---|---|
| `drive.list(folderId \| null)` | The folders and unexpired files directly in a folder (or the top level), with names, sizes, authors, times, fingerprints and whether the viewer may add, rename or remove each |
| `drive.addFolder(parentId \| null, name, addPolicy)` | A new folder, if the viewer may add there |
| `drive.addFile(folderId \| null, name, source, mimeType, keepFor)` | Puts the bytes in the blob layer, then writes the row. The size check is the app's own limit, as for attachments. |
| `drive.open(fileId)` | The file's bytes (fetched from members if needed), or "still arriving" / "not reachable" |
| `drive.rename(id, name)`, `drive.move(id, folderId)` | Under the rules above |
| `drive.keep(fileId, keepFor)` | Extends `ExpiresAt` |
| `drive.remove(id)` | Under the rules above |
| `drive.setAddPolicy(folderId, policy)` | Creator only |
| `drive.snapshot(folderId)` (later) | The folder as it is now, as one UnixFS directory: a single CID to export, archive or verify |

Blob lifetime follows the rows. Whenever the app lists a folder, it calls the blob layer's
`reference` for each file shown. An expired or removed file's blob gets no further references and
goes at gc. This is the same rule chat's attachments follow.

## Not in this spec

- **Moderation by managers.**
- **Per-file permissions** beyond author and folder creator.
- **Quotas.**
- **Search inside files.**
- **Offline edits of the same file by two members:** files are immutable; a revision is a new file.
