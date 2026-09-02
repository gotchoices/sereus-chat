---
provides: ["screen:mobile:StrandDetail"]
needs: ["domain:Op:Strands.listMembers", "domain:Op:Strands.getState", "domain:Entity:Member"]
dependsOn:
  - design/specs/mobile/screens/strand-detail.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/specs/domain/ops.md
  - design/stories/mobile/05-add-someone-to-a-strand.md
  - design/stories/mobile/31-whos-in-this-strand.md
  - design/stories/mobile/33-managing-a-strand.md
---

# Consolidation: StrandDetail

## Purpose

The membership and disposition of one strand. Hub for muting, leaving, adding, and giving up
manager rights.

## Route

- `StrandDetail` — push from the ChatInterface header
- Mock: `sereus://screen/StrandDetail?variant={happy|empty|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Group, several members, ≥1 manager | happy |
| empty | Two-party settled strand — short list, few actions | empty |
| error | Members cannot be loaded | error |

`empty` is not an absence of data; it is the minimal case. Do not render an EmptyState here.

## Data Requirements

```
StrandState { visibility: 'public'|'private', managerCount: number, settled: bool, canIManage: bool }
Member { id, name, avatarUri|null, isManager, isMe }
```

- `Strands.getState(strandId)` and `Strands.listMembers(strandId)`.
- `settled` ≡ `visibility === 'private' && managerCount === 0`.
- `name` is the local nickname where one exists, otherwise the shared display name. Nicknames are a
  sereus roadmap item; until then both resolve the same (stories STATUS §C.10).

## Status rendering — the load-bearing part

Three states, one sentence each (see spec). Rules the implementation must not break:

1. Derive **only** from `visibility` and `managerCount`. Never from activity, last-seen, or member
   count.
2. `managerCount > 0` renders "can change" even when every manager has been silent for a year.
   There is no *gone* state upstream and none may be invented.
3. Recompute on every state change and re-render everywhere the indicator appears — the same
   component serves StrandList rows, the ChatInterface header, and InvitationAcceptance.

## Actions → adapter

| Action | Call | Confirm |
|--------|------|---------|
| Mute | local prefs (`soft`/`hard`) | no |
| Archive | local prefs | no, undo toast |
| Leave | `Strands.leave(id, { keepIdentity: true })` | yes |
| Forget entirely | `Strands.leave(id, { keepIdentity: false })` | **twice** |
| Add someone | route → InvitationGenerator(strandId) | no |
| Give up ability | `Strands.resignManager(id)` | yes, plus exposure warning when `managerCount > 1` |
| Remove member | `Strands.removeMember(id, memberId)` | yes |

No delete-strand call exists in `ops.md` and none may be added.

## Member row

- Tap → sheet with exactly two options: *Start a strand with them* (→ InvitationGenerator, new
  strand) and *Rename for myself* (local).
- **No message action.** The absence is deliberate and load-bearing; a developer adding one would
  break the model, so it is worth a comment in the code.

## Component Inventory

- `StrandStatus` — **new shared component**; sentence + semantic colour, three states
- `ListRow` for members, with a manager tag and a "you" tag
- `SectionHeader`, `Banner`
- Action rows with destructive styling for leave / forget / remove

## Implementation Notes

- Warnings are copy, not modals-upon-modals: the resign confirmation includes the remaining-manager
  exposure in its body rather than as a second dialog.
- "Forget entirely" must guard the underlying control-row deletion the way `cadre strand remove`
  does — it destroys the party's only copy of the strand's member key (`STATUS.md` §G hazards).
- Storage figure for "Shared here" comes from the same source StrandMedia uses; compute once.
