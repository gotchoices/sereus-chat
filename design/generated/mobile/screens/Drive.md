---
provides: ["screen:mobile:Drive"]
needs: ["domain:Op:Drive.list", "domain:Op:Drive.addFolder", "domain:Op:Drive.addFile", "domain:Op:Drive.open", "domain:Op:Drive.keep", "domain:Op:Drive.rename", "domain:Op:Drive.move", "domain:Op:Drive.remove", "domain:Op:Drive.setAddPolicy"]
mocks: [Drive]
dependsOn:
  - design/specs/mobile/screens/drive.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/drive.md
  - packages/strand-drive/SPEC.md
  - design/stories/mobile/23-a-shared-drive.md
  - design/stories/mobile/20-sending-media.md
  - design/stories/mobile/21-receiving-media.md
---

# Consolidation: Drive

> The human spec (`specs/mobile/screens/drive.md`) **is silent** on this screen: everything below is
> generation's inference from story 23 and the drive module's spec, and may be overridden there.

## Purpose

One strand's shared drive (story 23): folders and files every member sees alike, kept apart from the
conversation, each file kept for a while and then gone for everyone.

## Route

- `Drive { strandId, folderId?, title? }`. Push from the chat header's folder icon, or StrandDetail's
  "Drive" row. Opening a folder pushes `Drive` again with its `folderId`, so Back walks up the tree
  and the header names the folder.
- Deep link: `sereus://strand/{id}/drive`
- Mock: `sereus://screen/Drive?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Folders and files | happy |
| empty | Nothing in the drive (or folder) yet: explain what the drive is, offer "Add" | empty |
| error | Listing fails: banner with Retry | error |
| still arriving | `open` fails `unavailable` / `still-arriving`: a toast, never "missing" (Alt F) | happy (`ridge-route.pdf` is not here) |
| not allowed | The folder's creator alone adds: no Add button, a line saying so (Alt A) | happy ("Routes" is Priya's, creator-only) |
| too large | `addFile` fails `too-large`: the catalog's message, as for attachments | n/a in mock |

## Data Requirements (core `ChatModel.drive`)

```
list(strandId, folderId?) → { folder, path, canAdd, folders: DriveFolder[], files: DriveFile[] }
DriveFolder { id, parentId, name, createdByName, createdAt, addPolicy: 'anyone'|'creator', mine, canAdd }
DriveFile   { id, folderId, name, size, mimeType, addedByName, addedAt, expiresAt, fingerprint, mine, here, uri }
addFolder(strandId, parentId, name, { addPolicy })    addFile(strandId, folderId, { uri, name, mimeType, keepFor })
open(strandId, fileId) → { uri }    keep(strandId, fileId, keepFor)    rename / move / remove (kind, id)
setAddPolicy(strandId, folderId, policy)
```

Re-list on `changes.strand(strandId)` (the drive's tables are watched like the conversation's) and on
the mock's data revision.

## Layout

- Header: the folder's name (or "Drive"); right: "Add" when `canAdd`.
- Folders first, then files, both by name (the module's order). Folder rows: folder icon, name, "by
  {name}", a lock when creator-only. File rows: icon by kind, name, then
  `{size} · {who} · {added} · kept until {date}`, and when another file here has the same name, the
  fingerprint (`#q7k2vd`), which is how Alt B tells same-named files apart.
- A file that is not here yet says "Opens when someone who has it is reachable" in the subtitle only
  after an open attempt failed; before that it is just a file (`here` false is normal).
- Not allowed to add here: a line under the header, "Only {creator} adds to this folder."

## Actions

- **Add** (ActionSheet): Photos (image library, several at once), Files (document picker, several),
  New folder (name prompt; at the top or in a folder anyone adds to it is "anyone", with a second
  choice "Only I add to it").
- After picking files: ActionSheet "Keep for": a day, a week, a month (default, first), a year.
  Then each file is added in turn, a toast per failure (too large, not allowed).
- **Tap a folder**: push Drive into it. **Tap a file**: `open`; an image shows full-screen in a
  modal over the drive; anything else goes to the device's Downloads ("Saved to Downloads"), the only
  generic way to hand a file to the user's other apps without a viewer library. Failure:
  `still-arriving` → toast "Still arriving…"; anything else, the error text.
- **Long-press a file**: Keep longer (anyone: day/week/month/year, never shorter), Rename, Move
  (mine only), Remove (mine only; confirm says copies others have cannot be reached: Alt D 5.4),
  Save to Downloads.
- **Long-press a folder**: Rename, Move, "Only I add" / "Anyone adds" (mine only), Remove (mine only;
  refused while others' things are in it: the module says why).
- **Move**: an ActionSheet of destinations: "Top of the drive", then the folders at the top and
  those in the current folder that the user may add to (not itself). A deeper tree is reached by
  moving in steps. Kept simple on purpose for the prototype.
- Rename and New folder use `PrivateTextSheet`-style single-line prompt (`TextPromptSheet`), not
  `Alert.prompt` (iOS only).

## Errors (catalog kinds)

`not-allowed`, `not-found`, `invalid-input`, `too-large`, `unavailable` (+ `still-arriving`): the
model's message when it has one, else the catalog's.

## Implementation Notes

- `apps/mobile/src/screens/Drive.tsx`; strings under `drive.*` in `@chat/resources`.
- Pickers: `react-native-image-picker` (`selectionLimit: 0`) and `@react-native-documents/picker`
  (`allowMultiSelection`, then `keepLocalCopy` so the URI outlives the picker), as MediaPicker does.
- Save to Downloads: `FileSystem.cpExternal(uri, name, 'downloads')` (react-native-file-access).
- No new libraries.

## Open

- Whether a drive change shows in the conversation (story 23 Open): not done; nothing is posted.
- A folder picker for Move across the whole tree.
