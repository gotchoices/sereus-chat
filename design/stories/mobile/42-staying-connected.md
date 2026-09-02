# User Story: Staying connected

**Status: stub.** What a user notices about their own machines, kept deliberately brief.

## Must cover

- Why messages sometimes wait, in the user's terms — no company is holding them.
- That adding a machine of their own keeps things moving while their phone is in their pocket. "He added a node so his messages would stop getting stuck" is the level of detail wanted.
- **Capacity**, which is the other concrete payoff and possibly the more legible one: a phone keeps only what it can and fetches the rest, so reaching into the past costs time and needs somebody reachable who has it. A strand carried by two phones may not hold its whole history between them. A more capable machine means more is to hand without waiting on anybody, and gives the strand something to lean on. See `specs/domain/overview.md` and [21](21-receiving-media.md) Alt E.
- The offline banner and what it means.
- **Deliberately shallow.** Cadre composition, node types, key custody and recovery are sereus's to design, and the app renders a component it does not own (`src/cadre-ui/`). This story must not specify cadre UI.

## Notes

Planned in `STATUS.md` §D; the hole it fills is STATUS.md §H. Write to
`appeus/templates/stories/story-template.md`: Story Overview, Roles where more than one party acts,
Sequence, Alternative Paths, Acceptance Criteria, Variants, and Open for anything still waiting on
sereus. Background all these stories assume: [theory.md](theory.md).
