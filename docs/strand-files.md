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
| S7 → S21, 1 MB: file on the S21 | 4 min, or never (S7 on cellular) | 1.9 s after the message was delivered, before the conversation was opened |
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

Serving from the S7 is still 8.3 s per MB. The bytes must be in JavaScript to go out over libp2p,
so the S7's block reads, and its stream encryption, remain.

## What it does not do yet

See the module README, "Not done". In short:
- placement (Arachnode);
- availability while every member who has a file is asleep;
- discovery beyond connected members;
- resuming a chunk mid-way;
- quotas;
- keeping one copy instead of two.

## Running it

- **Core:** `yarn workspace @chat/core vitest run src/files src/sereus/file-layer.test.ts`
- **serchat** (bundled first): `vitest run -c vitest.scenarios.config.ts test/attachments.test.ts`.
  `SERCHAT_CHUNK_STORE=1` goes back to chunk rows.
- **Phones** (`FILE_LAYER` in `apps/mobile/src/data/config.ts`; `PERF_LOG` for the timeline):
  - `node test/gui/phone-joins-serchat.mjs <S21>` with `BENCH=1000000 FILE=<jpg> PHONE_FILE=1
    PHONE_LOG=… SERCHAT_LOG=…`;
  - `node test/gui/phones-talk.mjs <S21> <S7> Bob`;
  - `PHOTO=<jpg> node test/gui/phone-wakes.mjs <S21>`.
