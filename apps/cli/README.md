# serchat

Sereus Chat on the command line — for testing, evaluating and debugging Sereus Chat,
not for everyday chatting. A client of `@chat/core` like the phone app.

- Stories: `design/stories/cli/` · commands and output: `design/specs/cli/commands.md`
- What serchat is for, how Sereus's cadres work, and the plan: `docs/serchat.md`

```sh
yarn workspace serchat build          # builds @chat/resources and @chat/core, then bundles
node apps/cli/dist/serchat.js         # interactive
node apps/cli/dist/serchat.js -p alice strands \; log 1 -n 5
```

## Try it: two people, two terminals

Build once, then open two terminal windows. Each runs serchat as a different person
(`-p` picks the profile; each profile is its own identity, kept in `~/.serchat/<name>/`).

```sh
yarn workspace serchat build
alias serchat="node $PWD/apps/cli/dist/serchat.js"   # from the repo root
```

**1. Start both** — window A as Alice, window B as Bob:

```
A$ serchat -p alice                     B$ serchat -p bob
```

Each prints `ready.` when its node is up. `help` (or `?`) lists the commands.

**2. In both windows: a name and a relay.** A relay is how anyone reaches you; without one
you can neither invite nor be answered. A host name is enough — serchat looks up the rest
and waits until the relay accepts you:

```
serchat> profile set name=Alice
serchat> relay add relay.sereus.org
relay relay.sereus.org: /dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E…
  its peer id 12D3KooWMD7E… was published by DNS
restarting the node with the new relays…
1	reserved	/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E…
```

`reserved` means it worked; `status` then says `reachable	yes`. (Bob does the same with
`name=Bob`.)

**3. Alice invites.** `invite` makes a new strand and prints its id and invitation link.
The link is long; copy it from the screen, or write it to a file with `-o`:

```
A serchat> invite -o /tmp/invite.txt
invite-1791923472208-bm3q3mze3	https://sereus.org/chat/invite/#eyJ0b2tl…	2026-10-14T20:31:12Z
```

**4. Bob joins** with the link: paste it after `join`. (From a shell instead of the prompt:
`serchat -p bob join "$(cat /tmp/invite.txt)" --yes`.) serchat shows what he is joining and
asks:

```
B serchat> join https://sereus.org/chat/invite/#eyJ0b2tl…
Whoever gave you this link invites you to a strand. …
Join this strand? [y/N] y
019d5410-7bb1-4560-a9c6-469f2e7d59f6
```

Joining takes a few seconds to half a minute.

**5. Talk.** A strand is named by its row in the last `strands` listing, so list first. The
title is the other person's name once their details have arrived:

```
B serchat> strands
1	019d5410-7bb1-4560-a9c6-469f2e7d59f6	Alice	2	0
B serchat> send 1 Hello Alice!

A serchat> strands
1	019d5410-7bb1-4560-a9c6-469f2e7d59f6	Bob	2	0
A serchat> tail 1                       ← prints messages as they arrive; Ctrl-C to stop
	019d5410…	649c8a74…	2026-10-13T20:31:53Z	Bob	Hello Alice!	…
^C
A serchat> send 1 Hi Bob, good to see you here

B serchat> log 1
1	019d5410…	649c8a74…	2026-10-13T20:31:53Z	me	Hello Alice!
2	019d5410…	8249ac1d…	2026-10-13T20:31:57Z	Alice	Hi Bob, good to see you here
```

A strand can also be named by a unique start of its id (`send 019d hi`) or by its title
(`send Alice hi`).

**6. Leave** with `quit` or Ctrl-D. Next time, `serchat -p alice` comes back as Alice, with
the same relay and strands. Both people need to be running for messages to move: there is
no server holding them in between.

Output lines are tab-separated (`--json` for JSON), so anything serchat prints can be
filtered with `grep`, `cut` or `awk`. Every command also works without the prompt, at the
cost of starting the node each time: `serchat -p bob log 1 -n 5`.

## Tests

- `yarn workspace serchat test` — unit tests (`src/`), seconds.
- `yarn workspace serchat scenarios` — two-person scenarios with real serchat processes
  and a relay started by the test (`test/`), minutes. A known bug is written as the
  correct behaviour and marked `it.fails`.

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
serchat -p alice relay add relay.sereus.org      # or a local relay: relay add 127.0.0.1:4002
serchat -p bob   relay add relay.sereus.org
serchat -p alice invite \; tail --all          # prints the link, then follows
serchat -p bob join '<link>' --yes \; strands \; send 1 hello
```

Against a phone, with the `test/devices` tools (serchat on the phone's relay):

```sh
serchat -p cli relay add <the phone's relay>
serchat -p cli --bridge 9301 idle &             # the bridge, on a loopback inspector port
PAIR=1 node test/devices/devtime.mjs node:9301 SM-G935V 3
```

A profile is used by one process at a time (`lock` in its folder).

`--listen` lets profiles dial each other directly instead, but a restarted profile may not
find the other again without a relay; the relay is the topology phones use.
