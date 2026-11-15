# Strand files: prototype results

Branch `strand-files`, 2026-11-14/15. A prototype of the file layer proposed in
[gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62), built as a self-contained
module (`packages/core/src/files`, design in its README) and wired into chat's attachments.

## What it is

A file is cut into 256 KiB blocks named by IPFS-compatible CIDs, plus a manifest block whose CID
is the file's id. Members exchange blocks over one protocol on the strand's libp2p node:
want/have requests, plus announcements of new files. Nothing goes through a transaction. The
strand's database carries only the attachment's ref, `cid:<file CID>`. Files are scoped to their
strand, kept by leases, and collected when no record reads them.

## Results

The same photo, the same relay (relay.sereus.org), the same phones, through the database (the
`chunks:1:` rows on `main`) and through the file layer:

| Path | Database | File layer |
|---|---|---|
| serchat → S21, 1 MB: commit | 149 s | 1.1 s |
| serchat → S21: file on the phone | about 3 min | 3.4 s after serchat began (phone fetch 1.2 s) |
| S21 → serchat, 0.84 MB: delivered | 57 s | 0.6 s after the phone's put (0.4 s) |
| S21 → serchat: file at serchat | 91 s | fetched in 0.98 s, in the background |
| S7 → S21, 1 MB: file on the S21 | 4 min, or never (S7 on cellular) | before the conversation is opened: fetched 6.6 s after the S7's announcement |
| S21 → S7, 0.84 MB: file on the S7 | | fetched in 5.2 s, 2.7 s after delivery |
| S21 asleep while serchat sends; back in the app | n/a | photo viewable 6.7 s after returning |
| S21 sends, then goes to the background at once | n/a | serchat already had it (announced, 1.1 s) |
| Raw bytes over the same connection (`bench.ts`), for reference | 0.4–0.9 s per MB | |

Core tests (two in-process parties over loopback): 2.3 MB sent in 107–150 ms, the file at the
other party 400 ms after the send began. serchat scenario (two processes, a local relay): 14 MB
in three files sent in 3.2 s, and a 12 MB fetch in 240 ms.

On the phones, base64 through JavaScript was the cost. Two optional host capabilities now keep a
file's bytes out of JavaScript where the bytes aren't needed there:
- **`importFile`:** a sent file is cut into blocks natively (read a chunk, write it, hash it).
- **`assemble`:** a viewable copy is made by appending block files natively.

Measured on the S7 sending 1 MB to the S21:

| Step | Before | After |
|---|---|---|
| put (cut into blocks) | 3.8 s | 0.47 s |
| whole send | 8.7 s | 1.5 s |
| S21 viewable copy | 0.97 s | 17 ms |

Serving from the S7 went from 8.3 s per MB to 6.6 s:
- reading the next block while the current one is sending;
- sending the file's manifest with its announcement (the receiver checks it against the CID),
  which saves a round trip.

The rest is the S7 reading its blocks into JavaScript (base64 through the bridge), which libp2p
needs, while the phone is also delivering its message. Its raw bench is 1.1 s per MB each way.
On the S21 the same fetch takes about 1.2 s.

## Transient members

Two members who are rarely online together, the case a new pair of users is in, tested with
their strands put to sleep and woken as phones do (`file-transient.test.ts`,
`files/transient.test.ts`):
- **An interrupted transfer resumes:** the receiver keeps the chunks it got, and on the next try
  fetches only the rest.
- **A file put while alone waits in the outbox,** is offered when a member connects, and is
  marked placed once a member holds it. This survives an app restart.
- **Both away, then back at the same moment:** the photo was at Bob 0.7 s after both woke.
- **Alice's party with a cadre member,** a storage-profile cadre-core node with no chat app. With
  Alice away, Bob got her message from the member's replica 0.45 s after waking. The photo
  stayed "still arriving" (no error, no hang) until Alice returned, then arrived 0.7 s later.
  The member holds the strand's rows but no files: placement (#62) would close that.

On the S21 against serchat (`test/gui/phone-wakes.mjs`, PASS):
- **The phone asleep while serchat sends:** serchat's announcement reached nobody. When the
  phone woke, serchat's outbox offered the file again; the phone fetched it (1.1 s) and the
  file was placed.
- **The phone sends, then leaves at once:** serchat already had it, 0.5 s after.
- **Both away** (serchat stopped; the phone sends, its photo announced to nobody, and goes to the
  background), **then back together:** the phone's message queue drained, and its outbox offered
  the file. serchat had the message and the 1 MB photo 6.6 s after both came back.

The tests found one bug: a wake rebuilds a strand's node and announces it as `strand:waking`,
not `strand:started`. So after a wake, files were served only from the dead node until the next
put or fetch. Fixed.

## What it does not do yet

See the module README, "Not done". In short:
- placement (Arachnode);
- availability while every member who has a file is asleep;
- discovery beyond connected members;
- resuming a chunk mid-way;
- quotas;
- keeping one copy instead of two.

## Running it

- **Core:** `yarn workspace @chat/core vitest run src/files src/sereus/file-layer.test.ts src/sereus/file-transient.test.ts`
- **serchat** (bundled first): `vitest run -c vitest.scenarios.config.ts test/attachments.test.ts`.
  `SERCHAT_CHUNK_STORE=1` goes back to chunk rows.
- **Phones** (`FILE_LAYER` in `apps/mobile/src/data/config.ts`; `PERF_LOG` for the timeline):
  - `node test/gui/phone-joins-serchat.mjs <S21>` with `BENCH=1000000 FILE=<jpg> PHONE_FILE=1
    PHONE_LOG=… SERCHAT_LOG=…`;
  - `node test/gui/phones-talk.mjs <S21> <S7> Bob`;
  - `PHOTO=<jpg> node test/gui/phone-wakes.mjs <S21>`: the phone asleep while serchat sends;
    the phone sending and leaving at once; both away and back together.
