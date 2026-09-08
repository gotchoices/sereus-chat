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
| 20 | [Sending media](20-sending-media.md) | revised | review — size limit is the user's setting; paired with 21 |
| 21 | [Receiving media](21-receiving-media.md) | drafted | review |
| 30 | [My strands](30-my-strands.md) | revised | review — no email; narrowing defers to 32 |
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
- [x] **20 and 30 rewritten.** Both had been renamed but never revised. 30 had Bob reading Sarah's
      **email** (only a name and avatar are ever shared) and its own search/sort/filter design, now
      deferred to [32](32-finding-something.md) and the StrandList spec; it gained group strands,
      private names, the not-reachable case, and setting a strand aside. 20's "too large" is now
      explicitly **the user's own setting**, and it hands the receiving half to [21](21-receiving-media.md).

## To do — story content

- [ ] **Trim 90.** Over-specified for something parked — mid-call video upgrade and screen sharing
      are asserted as free. Group calling is a further question and is not assumed.
- [ ] **Alternative-path return points.** Paths are now `### Alternative Path X: name` throughout,
      but several never state which step they rejoin. Settle per story during review.
- [ ] **20 promises a setting 41 does not have.** 20 says an attachment "too large" is measured
      against a limit the user set "in [41](41-settings.md)" — but 41 only has a **storage
      ceiling** (how much room the app takes), which is a different thing from a limit on what
      you are willing to *send*. Either add an outgoing-size setting to 41 or drop the forward
      reference from 20. **Do not leave both as they are** — a story that points at a setting
      which does not exist is worse than one that does not mention it.
- [ ] **20 introduces permission refusal, and nothing else covers it.** Alt D (the phone refuses
      camera or library) is new with this rewrite: no other story, screen spec or consolidation
      handles it, so there is no screen behaviour behind it yet.
- [ ] **30 depends on read position, which has no home upstream.** "Opening a row lands where the
      user left off" rests on [10](10-catching-up.md)'s read boundary, and per-user, party-private
      state is exactly what gotchoices/sereus#6 says there is nowhere to put. Device-local for now;
      revisit if #6 lands.
- [ ] **30 depends on private names, which are sereus roadmap.** Surfacing a user's own name for a
      partner (and never disclosing it) is provided by sereus, not invented here — and is not
      available yet. The story is written to surface them when they arrive; nothing to build until
      then, but it means 30 cannot be fully satisfied today.
- [ ] **30 assumes a stable "what was last said" ordering.** Whether per-collection revision order
      is available to sApps is gotchoices/sereus#5, still open.
- [ ] **Human review of all 19.** Nothing has been read and accepted yet.

## To do — decisions still ours

- [ ] **Who the invitation says is inviting.** [03](03-respond-to-an-invitation.md) requires that
      before accepting, a person sees who is inviting them and on what terms. The platform token
      carries neither — it is a bearer token, and the row saying whether it is still good lives in
      the host's control database. Carrying the inviter's claimed name in the LINK, labelled as a
      claim nothing proves (as `relay-offer` already does for a relay's name), would satisfy it.
      Until this is settled the acceptance screen is honestly unattributed.

Everything else is recorded in [index.md](index.md) (deferrals) or
[`specs/domain/sereus.md`](../../specs/domain/sereus.md) (platform).

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
- Reply is quote-reply plus `@`-mentions; no threading. Revisit only if groups get large.
- Any limit on what a user sends or stores is theirs to set. There is no platform limit and no
  authority to impose one.
