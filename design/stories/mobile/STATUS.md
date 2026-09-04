# Stories STATUS (mobile)

Checklist for the story set. The set itself, its grouping and its deliberate deferrals live in
[index.md](index.md). Platform facts — what sereus does, what is roadmap, what is broken — live in
[`specs/domain/sereus.md`](../../specs/domain/sereus.md). Screen and code work is tracked in
[`specs/mobile/STATUS.md`](../../specs/mobile/STATUS.md).

States: **stub** → **drafted** (written, not reviewed) → **reviewed** (human accepted) →
**revised** (changed after review).

## The set

19 stories. Numbering is gapped so stories can be inserted without renaming.

| # | Story | State | Outstanding |
|---|-------|-------|-------------|
| 01 | [First run](01-first-run.md) | drafted | review |
| 02 | [Start a strand](02-start-a-strand.md) | revised | review — adds "nowhere to be reached yet" |
| 03 | [Respond to an invitation](03-respond-to-an-invitation.md) | revised | review |
| 04 | [Our first conversation](04-our-first-conversation.md) | revised | review |
| 05 | [Add someone to a strand](05-add-someone-to-a-strand.md) | revised | review |
| 10 | [Catching up](10-catching-up.md) | revised | review |
| 11 | [Writing a message](11-writing-a-message.md) | revised | review |
| 12 | [Replying and mentioning](12-replying-and-mentioning.md) | drafted | review |
| 13 | [Correcting a message](13-correcting-a-message.md) | revised | review |
| 20 | [Sending media](20-sending-media.md) | **renamed only** | still pre-sereus — rewrite |
| 21 | [Receiving media](21-receiving-media.md) | drafted | review |
| 30 | [My strands](30-my-strands.md) | **renamed only** | still pre-sereus — rewrite |
| 31 | [Who's in this strand](31-whos-in-this-strand.md) | drafted | review |
| 32 | [Finding something](32-finding-something.md) | revised | review — narrow by name vs. search what was said |
| 33 | [Managing a strand](33-managing-a-strand.md) | revised | review |
| 40 | [My profile](40-my-profile.md) | drafted | review |
| 41 | [Settings](41-settings.md) | drafted | review |
| 42 | [Staying connected](42-staying-connected.md) | revised | review — leads with reachability; borrowing a relay and its cost |
| 90 | [Voice and video call](90-voice-and-video-call.md) | parked | trim; after messaging |

## Done

- [x] Renumbered with gaps; `discovery`/`responding` split into 01–04
- [x] Template conformance: headings, As-a block, plain titles, `## Variants` on every story
- [x] `## Roles` and `## Open` sections where they earn a place
- [x] "Strand" adopted as the user-facing word throughout
- [x] index.md rewritten: grouping, provenance, deliberate deferrals
- [x] [theory.md](theory.md) written — the background the stories assume
- [x] Nine new stories drafted (04, 05, 10, 11, 12, 21, 31, 41, 42)
- [x] Forwarding drafted then **dropped**; recorded as a deferral in index.md
- [x] `Message.Status` dropped — no delivery or read state anywhere

## To do — story content

- [ ] **Rewrite 20, 30, 32.** Renamed but never revised, so they now contradict the specs and
      screens built from them:
  - [ ] 30 has Bob reading Sarah's **email**; only name and avatar are ever shared (`schema.md`)
  - [ ] 20 needs trimming and pairing with 21; its size-limit criterion should read as the
        **user's** setting, not a platform rule
- [ ] **Trim 90.** Over-specified for something parked — mid-call video upgrade and screen sharing
      are asserted as free. Group calling is a further question and is not assumed.
- [ ] **Alternative-path return points.** Paths are now `### Alternative Path X: name` throughout,
      but several never state which step they rejoin. Settle per story during review.
- [ ] **Human review of all 19.** Nothing has been read and accepted yet.

## To do — decisions still ours

- [ ] **Reply vs. threading beyond quote-reply** — settled as quote-reply plus `@`-mentions;
      revisit only if groups get large.
- [ ] Nothing else outstanding. Every other decision is recorded in index.md (deferrals) or
      `specs/domain/sereus.md` (platform).

## Settled decisions (for reference)

- Group strands from inception; a strand is 2–N parties.
- Membership is not an address: no private route to a fellow member, and generally no way to invite
  them either.
- A new member holds the whole history. Confidentiality is bounded by what the strand agreed to.
- No delivery or read state; a reply is the evidence a message was read.
- Muting has two levels, hard and soft, and the user chooses.
- Deletion may leave a trace; the app simply never manufactures one.
- No link previews, and no forwarding mechanism.
- Reaction symbols are open, not a curated palette.
