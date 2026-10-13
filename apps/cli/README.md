# serchat

Sereus Chat on the command line — for testing, evaluating and debugging Sereus Chat,
not for everyday chatting. A client of `@chat/core` like the phone app.

- Stories: `design/stories/cli/` · commands and output: `design/specs/cli/commands.md`

```sh
yarn workspace serchat build          # builds @chat/resources and @chat/core, then bundles
node apps/cli/dist/serchat.js         # interactive
node apps/cli/dist/serchat.js -p alice strands \; log 1 -n 5
```

## How it is built

- `src/host.ts` — the node (cadre-core, shaped like the phone's) with file-backed stores in
  the profile folder, and the core's slots as files. `src/home.ts` — the profile folder.
- `src/commands/` — one file per area; each command is a few `ChatModel` calls and rows.
- `src/output.ts` (tab-separated / JSON lines), `src/refs.ts` (rows, ids, titles),
  `src/lex.ts` (command lines), `src/session.ts` (what commands share, exit codes).
- `scripts/bundle.mjs` — one file, `dist/serchat.js`, with `@chat/*` bundled in and the
  stack left as `dependencies`, so the published package needs nothing unpublished.

It is a workspace member (unlike `apps/mobile`), so it shares the one installed copy of the
stack with the core.

## Testing without phones

Two profiles on one machine, through a relay (`yarn relay` at the repo root):

```sh
serchat -p alice relay add /ip4/127.0.0.1/tcp/4002/ws/p2p/<relay peer id>
serchat -p bob   relay add /ip4/127.0.0.1/tcp/4002/ws/p2p/<relay peer id>
serchat -p alice invite \; tail --all          # prints the link, then follows
serchat -p bob join '<link>' --yes \; strands \; send 1 hello
```

`--listen` lets profiles dial each other directly instead, but a restarted profile may not
find the other again without a relay; the relay is the topology phones use.
