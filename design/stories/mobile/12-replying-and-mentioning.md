# User Story: Replying and mentioning

**Status: stub.** Answering a particular message, and getting a particular person's attention.

## Must cover

- Quote-reply — decided in favour over threading, because a group conversation needs it to stay legible.
- `@`-mentions, which are what make notification in a busy strand bearable, and which feed triage in [10](10-catching-up.md). A mention is also what a soft mute lets through ([33](33-managing-a-strand.md)), so the two features define each other.
- Naming someone uses the nickname the user has for them, which sereus supplies and which the named person may never see — so a mention must resolve to a member, not to a piece of text.
- Reactions, which scale in a group where extra messages do not.
- `specs/mobile/screens/chat-interface.md` already specifies the long-press reply menu; no story does.

## Notes

Planned in `STATUS.md` §D; the hole it fills is STATUS.md §C.3, §C.4. Write to
`appeus/templates/stories/story-template.md`: Story Overview, Roles where more than one party acts,
Sequence, Alternative Paths, Acceptance Criteria, Variants, and Open for anything still waiting on
sereus. Background all these stories assume: [theory.md](theory.md).
