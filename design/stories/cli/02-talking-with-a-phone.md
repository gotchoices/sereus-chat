# User Story: Talking with a phone

## Story Overview
As someone with serchat and a friend with the phone app
I want to start a strand, invite them, and chat
So that I can see the two apps interoperate

## Sequence
1. Bob makes an invitation: `invite`. The link is long; he copies it from the terminal, or
   has it written to a file, and sends it to Susan. (To show her a QR code instead, he
   feeds the link to a QR tool of his own.) She opens it on her phone.
2. When she joins, the new strand shows up in `strands`.
3. He reads with `log 1` and answers with `send 1 hello`. `tail 1` keeps printing what
   arrives until he presses Ctrl-C.
4. The other way round: Susan invites him; he runs `join <link>`, sees who invites him and
   what the strand is, and confirms.

```
serchat> strands
1	f8f301bf	Susan	2	0	2026-10-12T18:20:11Z	hi from the phone
serchat> send 1 hello back
f8f301bf	9c1e04a2	2026-10-12T18:21:03Z	me	hello back
serchat> log 1 -n 2
1	f8f301bf	71aa0c3e	2026-10-12T18:20:11Z	Susan	hi from the phone
2	f8f301bf	9c1e04a2	2026-10-12T18:21:03Z	me	hello back
```

## Acceptance Criteria
- [ ] A strand made here can be joined from the phone, and the reverse
- [ ] A strand can be named by its row in the last list shown, its id (or a unique start of
      it), or its title
- [ ] Joining shows the same facts the phone shows before accepting (who, what kind of strand)
