# @chat/strand-drive

A strand's shared drive: folders and files as rows in the strand's database, with each file
naming a blob. It's built to move into the sereus stack as a module any sApp can include
([gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62)). The design is
[SPEC.md](SPEC.md).

- **`driveSchema(prefix = 'Drive')`:** the schema fragment an app merges into its own sApp schema
  (`DriveFolder`, `DriveFile`).
- **`StrandDrive`:** reads and writes those rows under the spec's rules. It needs only a database
  that runs SQL (`exec`, `eval`: Quereus's, on the strand), the schema name, the prefix, and the
  viewer's member id.
- **No bytes here.** The app puts a file's bytes in the strand's blob service (Optimystic native
  blobs under sereus) and passes the reference (a CID). The column is a `blobref`, so the stack keeps
  the bytes alive for as long as a row names them. `blobs()` lists the references live files name.

Concurrent edits merge row by row in the database: two members adding at once are two rows, and
same names coexist by design.

## Tests

Eight, against a real Quereus database with the fragment applied as sereus applies an sApp schema:
- every member sees the same folders and files;
- a folder only its creator adds to;
- same names coexist;
- only authors rename, move and remove, while anyone can keep a file longer;
- expiry;
- removing a folder;
- the move-cycle rule;
- a file whose folder hasn't arrived yet.

## History

The first attempt used MFS (`@helia/mfs`): one root per tree, last writer wins. It's in the git
history of this branch.
