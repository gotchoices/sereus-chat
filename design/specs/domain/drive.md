# Drive (pointer)

The strand drive of story [23](../../stories/mobile/23-a-shared-drive.md) is a module meant to move
into the sereus stack, so its spec lives with it, not here:
[`packages/strand-drive/SPEC.md`](../../../packages/strand-drive/SPEC.md). It covers the schema
fragment (tables prefixed `Drive`, merged into the app's `App` schema), the rules (who may add,
rename, move and remove), lifetime and expiry, removal, and the module's operations.

What chat adds on top is only the screens (story 23) and its own settings: the size limit for adding
a file is the user's attachment limit (story 20).
