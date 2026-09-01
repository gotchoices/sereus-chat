# Stories Index (mobile)

The set of stories we intend to write, in reading order, and where each came from. Not a story
itself.

Background all of them assume: [theory.md](theory.md). Progress per story is tracked in
[STATUS.md](STATUS.md). Files excluded from the index itself: `AGENTS.md`, `README.md`,
`STATUS.md`, `theory.md`.

Numbering leaves gaps so stories can be inserted without renumbering. A stub file exists for every
planned story; it states the topic and what it must cover.

## Grouping

- **01–05 Getting connected** — first run through a strand that has grown
- **10–13 Everyday messaging** — reading, writing, replying, correcting
- **20–22 Media** — sending, receiving, passing on
- **30–33 Strands and housekeeping** — the list, the membership, finding, managing
- **40–42 Me and my app** — profile, settings, and what a user notices of their own machines
- **90 Calls** — kept as an objective, developed last

## The set

| # | Story | State |
|---|-------|-------|
| 01 | [First run](01-first-run.md) | drafted |
| 02 | [Start a strand](02-start-a-strand.md) | drafted, revised |
| 03 | [Respond to an invitation](03-respond-to-an-invitation.md) | drafted, revised |
| 04 | [Our first conversation](04-our-first-conversation.md) | drafted |
| 05 | [Add someone to a strand](05-add-someone-to-a-strand.md) | stub |
| 10 | [Catching up](10-catching-up.md) | drafted |
| 11 | [Writing a message](11-writing-a-message.md) | stub |
| 12 | [Replying and mentioning](12-replying-and-mentioning.md) | stub |
| 13 | [Correcting a message](13-correcting-a-message.md) | drafted |
| 20 | [Sending media](20-sending-media.md) | renamed, awaiting revision |
| 21 | [Receiving media](21-receiving-media.md) | stub |
| 22 | [Forwarding a message](22-forwarding-a-message.md) | stub |
| 30 | [My strands](30-my-strands.md) | renamed, awaiting revision |
| 31 | [Who's in this strand](31-whos-in-this-strand.md) | stub |
| 32 | [Finding something](32-finding-something.md) | renamed, awaiting revision |
| 33 | [Managing a strand](33-managing-a-strand.md) | drafted |
| 40 | [My profile](40-my-profile.md) | drafted |
| 41 | [Settings](41-settings.md) | stub |
| 42 | [Staying connected](42-staying-connected.md) | stub |
| 90 | [Voice and video call](90-voice-and-video-call.md) | parked |

## Provenance

01–04 and 13, 20, 30, 32, 33, 40, 90 descend from the nine unnumbered stories written before the
sereus vocabulary landed. 01/02 and 03/04 are splits of the former `discovery.md` and
`responding.md`, which each carried two stories.

## Deliberate deferrals

Decisions, not gaps:

- **Voice and video calling** — kept as an objective, sequenced last (90). Likely built on a
  non-sereus library, and likely needs at least one participant running a full-time cadre node.
  Group calling is a further question and is not assumed.
- **Threading** — quote-reply and `@`-mentions instead (12). Threading is a different screen model.
- **Cadre management** — sereus's to design. The app renders a component it does not own; story 42
  covers only what a user perceives.
- **Web and desktop** — stories are per-target. `design/stories/web/` is a separate future effort.

## Out of the app's hands

Recorded so stories stay consistent and do not re-invent them — see `STATUS.md` Appendix for the
full set of assumptions:

- There is no directory. Nobody can be looked up, and a strand carries a member's display identity,
  not a route to them.
- A private strand has *n* managers, no owner. A manager may grant permission to invite members and
  managers.
- A strand cannot be deleted, only left, unless you are its last member. Leaving is a local act:
  your cadre stops taking part, and keeping your key lets you return as the same member.
- A strand is public or private at creation. There is no maximum-size setting: a manager may invite
  anyone at any time, each invitation says whether its holder becomes a manager, and a manager may
  resign. A strand with no managers can never grow — which is how a permanently two-party strand is
  made.
- A new member holds the whole history. Confidentiality is bounded by what the strand agreed to at
  formation, never by read filters.
