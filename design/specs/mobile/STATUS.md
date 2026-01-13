# Target STATUS (phase checklist)

This file tracks progress for a single app target (`<target>`). It is meant to be updated by the human (with agent assistance).

Phases are defined in `appeus/docs/DESIGN.md` (authoritative).

## Bootstrap / Discovery (shared)
- [ ] `design/specs/project.md` is complete enough to proceed

## Story Generation (this target)
- [ ] Stories exist under `design/stories/<target>/` and describe the intended experience

## Navigation Planning (this target)
- [ ] `design/specs/<target>/navigation.md` exists and is reviewed
- [ ] `design/specs/<target>/screens/index.md` lists the intended screens/routes

## Domain Contract (shared)
- [ ] `design/specs/domain/` is sufficient to support this target’s slices

## Screen/Component Slicing (this target)
- [ ] Key screens/components have specs under `design/specs/<target>/screens/` and `design/specs/<target>/components/`
- [ ] Slices are being generated one at a time with test/commit pauses

## Scenario / Peer Review (optional)
- [ ] Scenario docs/images exist under `design/generated/<target>/scenarios/` and `design/generated/<target>/images/`

## Final wiring
- [ ] Production data wiring is implemented and tested


