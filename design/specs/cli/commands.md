# serchat — commands and output

The command-line client (`apps/cli`). Stories: `design/stories/cli/`. It is a client of
`@chat/core` like any other app: every command is one or a few `ChatModel` calls.

## Invocation

```
serchat [global options]                       interactive (stdin is a terminal)
serchat [global options] < script              one command per line from stdin
serchat [global options] <command> [args] [\; <command> [args] ...]
serchat [global options] -c '<command>; <command>'
```

- With a command, serchat starts its node, waits for its strands to settle (bounded by
  `--wait`), runs the commands in order, and stops. Slow by design: no background process.
- `;` as its own argument separates commands (quote it in the shell: `\;` or `';'`).
  A `;` inside an argument is text. `-c` takes one string and splits it the same way the
  interactive prompt does.
- The interactive prompt keeps history (`history` file in the profile) and completes command
  names. `quit` or Ctrl-D leaves; Ctrl-C stops a running `tail`.
- A command line is split like a shell's: spaces separate, quotes group, `\` escapes.
- A command can be shortened to any unique beginning of its name (`stat` → `status`; `st` is ambiguous with `strands`); an
  ambiguous one is a usage error listing the candidates. Scripts should spell commands
  out: an abbreviation that is unique today can stop being unique when a command is added.

### Global options

| Option | Meaning |
|---|---|
| `-p, --profile <name>` | Profile to use (default `default`) |
| `--home <dir>` | Where profiles live (default `$SERCHAT_HOME`, else `~/.serchat`) |
| `--json` | JSON lines instead of tab-separated lines |
| `--header` | Print a column header line first (tab-separated output only) |
| `--relay <multiaddr>` | Use this relay for this run, in addition to saved ones (repeatable) |
| `--listen [<multiaddr>]` | Also listen, so peers can dial in directly. Default: loopback on a port chosen on first use and kept in `profile.json`, so other profiles find this one again next run |
| `--wait <seconds>` | One-shot: how long to wait, before running, for the relay reservation (if any) and for strands to open (default 30) |
| `--bridge <port>` | Development bridge (`@chat/core/diagnostics`) on a loopback Node inspector port, for the `test/devices` tools (`node:<port>` as the device). An inspector runs any code it is sent: development only |
| `-v, --verbose` | Network-layer log lines to stderr |
| `-h, --help` · `--version` | |

## The profile folder

`~/.serchat/<profile>/` (mode 0700). Deleting it is a clean slate.

| Path | What |
|---|---|
| `profile.json` | party id, relays, listen setting, created-at |
| `keys/` | the node identity (`FileKeyStore`; files mode 0600). Anyone with it is this person |
| `blocks/<scope>/` | block storage, one folder per storage scope (`FileRawStorage`) |
| `node/` | the node's own records: trusted owners, bootstrap peers, machines, strand network state |
| `slots/` | the core's slots (profile, prefs, invitations, drafts, read cursors), one file each |
| `last.json` | the rows of the last `strands` and `log` listings, for row references |
| `history` | interactive command history |

## Naming things

A **strand** is named by any of:
- its row number in the last `strands` listing (`3`) — what was printed, not today's order;
- its id, or a unique beginning of it of at least 4 characters (`f8f3`);
- its title, exactly (case-insensitive), if no other strand has it.

A **message** is named by its row in the last `log` of that strand, or its id or id prefix.
An ambiguous or unknown name is an error (exit 4) that lists the candidates.

## Output

- **stdout is data only.** Progress, prompts, warnings and errors go to stderr.
- **One record per line**, fields separated by a tab, in the documented column order.
  Nothing is aligned or truncated. Empty fields are empty.
- **Escaping:** inside a field, tab is `\t`, newline `\n`, backslash `\\`. One record is
  always one line.
- **Ids** are printed in full. **Times** are ISO 8601 UTC (`2026-10-12T18:20:11Z`).
- **Rows:** listings start with a row number, the one later commands accept.
- **`--json`:** one JSON object per line with the same fields, named as in the column lists
  below.
- **Key/value commands** (`status`, `profile`, `prefs`) print `key<TAB>value` lines;
  multi-valued keys repeat.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Done |
| 1 | Usage: unknown command, bad option |
| 2 | Failed, and trying again will not help (`invitation-spent`, …) |
| 3 | Failed, and trying again may help (`unavailable`, `unreachable`, …) — the core's `retryable` |
| 4 | No such strand or message, or an ambiguous name |

With several commands, serchat stops at the first failure and exits with its code. The error
text comes from the shared catalog (`@chat/resources`, `errors.<kind>`); with `-v`, the
core's own message is added.

## Commands

Columns are listed in order. `[…]` optional, `<…>` required.

### `status`
Key/value: `profile`, `peer`, `party`, `owner` (`yes`/`no`), `reachable` (`yes`/`no`),
`relay` (repeat: `relay<TAB>status<TAB>addr`), `address` (repeat: where this node can be reached, relay circuits included), `strands` (count),
`settling` (`yes`/`no`). An empty multi-valued key prints no line.

### `profile [set <field>=<value> ...]`
Show or change name, email, phone, notes. Key/value.

### `prefs [set <key>=<value> ...]`
Show or change preferences (`notifyDefault`, `language`, …). Key/value.

### `relay` · `relay add <host[:port] | multiaddr>` · `relay remove <multiaddr|row>`
List: `row  status  multiaddr`. Saved relays apply to every later run; adding or removing
restarts the node and waits (up to 30 s) for a reservation.

A relay address ends in the **relay's** peer id (`/p2p/12D3…`), which pins the machine. What
may be typed instead:

| Typed | Becomes |
|---|---|
| a full multiaddr ending in `/p2p/…` | itself |
| `relay.sereus.org` (a host) | its published address (`_dnsaddr.<host>` TXT, WebSocket entry), else `/dns4/<host>/tcp/4011/ws` plus the peer id learned by connecting |
| `host:port` | `/dns4/<host>/tcp/<port>/ws` plus the learned peer id |
| `/dnsaddr/<host>` | its published address |
| a multiaddr without `/p2p/` | itself plus the learned peer id |

A learned peer id trusts whatever answered first; serchat prints how the id was obtained.
4011 is a Sereus relay's deployed WebSocket port. The same relay under another name (same
peer id) is not added twice. When nothing answers, serchat says so, and suggests
`relay.<host>` if that publishes a relay — it never uses it unasked.

### `strands [-a|--archived] [--all]`
`row  id  title  members  unread  lastAt  lastFrom  lastText`
Pending and opening strands are listed with an empty `lastAt` and `lastText` = `(opening)`.

### `log <strand> [-n <count>] [--before <message>]`
Messages oldest first, default the last 20:
`row  strandId  messageId  time  from  text  replyTo  edited  attachments`
`from` is the sender's name, `me` for this profile.

### `tail <strand>... | tail --all`
Follows: prints each arriving message as `log` does (row empty), plus `arrivedAt`, until
Ctrl-C. In a one-shot run it is the last command and ends the run when interrupted.

### `send <strand> <text...> | send <strand> -`
`-` reads the text from stdin (one-shot only). `--reply <message>`.
Prints the sent message as a `log` line plus `commitMs`.

### `members <strand>`
`row  memberId  name  manager  me`

### `invite [--strand <strand>] [--public] [--manager] [--multi] [--valid day|week|month] [-o <file>]`
Makes an invitation (a new strand unless `--strand`). Prints `id  url  expiresAt`.
`-o <file>` also writes the link alone, one line, to the file (mode 0600: whoever holds the
link can use it). How the link reaches the other person — pasted, sent as a file, shown as a
QR code made with some other tool — is up to the user; serchat only makes it.
`invites` lists outstanding: `row  id  strandId  expiresAt  uses  url`. `invite cancel <id|row>`.

### `join <link|token> [--yes]`
Shows the preview on stderr (who invites, the strand's status, what accepting grants) and
asks; `--yes` skips the question (required when stdin is not a terminal). Prints
`strandId`.

### `mute <strand> [soft|hard|none]` · `archive <strand>` · `unarchive <strand>` · `leave <strand> [--forget]`

### `network`
The cadre: `status`-like key/value for the node, then `machine<TAB>peerId<TAB>thisDevice`.

### `idle`
Keeps the node running — reachable and syncing — until Ctrl-C. With `--bridge`, it is how a
test tool drives a serchat that has nothing else to do.

### `help [command]` (also `?`) · `quit`

## Not yet

Attachments, reactions, edits and deletes (`react`, `edit`, `delete`), search, claiming a
machine. They fit the same patterns when wanted.
