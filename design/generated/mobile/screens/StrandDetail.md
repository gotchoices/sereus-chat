---
provides: ["screen:mobile:StrandDetail"]
needs: ["domain:Op:Strands.listMembers", "domain:Op:Strands.getState", "domain:Entity:Member", "domain:Op:Invitations.listOutstanding", "domain:Op:Invitations.cancel"]
dependsOn:
  - design/specs/domain/sereus.md
  - design/specs/project.md
  - design/specs/mobile/screens/strand-detail.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/components/index.md
  - design/specs/domain/overview.md
  - design/specs/domain/ops.md
  - design/stories/mobile/02-start-a-strand.md
  - design/stories/mobile/05-add-someone-to-a-strand.md
  - design/stories/mobile/31-whos-in-this-strand.md
  - design/stories/mobile/33-managing-a-strand.md
---

# Consolidation: StrandDetail

> The human spec (`specs/mobile/screens/strand-detail.md`) **is silent** on this screen: everything
> below is generation's inference from the stories, and may be overridden there at any
> time.

## Purpose

The membership and disposition of one strand: a box holding its **members** and the **invitations
the user has out** for it (stories 31 1a, 05 step 5, 02 step 9). It is also the hub for muting,
leaving, inviting, and giving up manager rights.

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

## Loading

Reading state and members can take tens of seconds on a slow phone while the strand syncs (seen on
the S7 right after someone joined). Until state arrives, show a spinner under What this is; bare
section headings read as an empty strand.

## Sections, in order

1. **What this is:** `StrandStatus`, full variant.
2. **Members (n):** me first, then managers, then the rest. With nobody else yet, the list is just
   "you", plus a line saying nobody has joined yet. It is not an EmptyState; this is the minimal
   case.
3. **Invitations you have out (n).** Shown whenever the strand can still grow (private and not
   settled):
   - **Rows:** one per outstanding invitation for this strand
     (`Invitations.listOutstanding()` filtered by `strandId`). Title "Made {date, time}", subtitle
     "Runs out {date}".
   - **Tap a row:** opens InvitationGenerator on that invitation (`{ token }`), the same screen that
     made it, to show the link or QR and share it again. A long press offers "Take it off the list"
     (local only; see the InvitationGenerator consolidation for why it cannot withdraw).
   - **"Make an invitation":** shown when `canIManage`. It moves here from the managing section.
     Inviting belongs with the invitations.
   - **Note, always shown in this section:** "Invitations other members have out are not shown: an
     invitation is known only to whoever made it." That is a platform fact. Outstanding invitations
     live in the inviting party's control database, and the strand only learns of one when it is
     redeemed. Story 31 requires saying so, rather than letting zero rows imply none exist.
   - **Settled or public strands:** no section. Nobody can be invited (story 05).
4. **Shared here**, **This conversation**, and **Because you can add and remove people** (now just
   giving up the ability), as before.

**Started {date}** (story 31) is **not rendered yet.** No such fact exists: sereus records no
creation time (neither the control `Strand` row nor the strand `Header`), and `chat-sapp.qsql` has
no column for it. It would have to become an app-recorded, founder-asserted time. That is a domain
schema change, and the human has been asked about it. When it exists it goes at the top of the
screen, above What this is.

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
| Make an invitation | route → InvitationGenerator(strandId) | no |
| Open an invitation | route → InvitationGenerator({ token }) | no |
| Take an invitation off the list | `Invitations.cancel(id)` (local only today) | yes, says it still works until it runs out |
| Give up ability | `Strands.resignManager(id)` | yes, plus exposure warning when `managerCount > 1` |
| Remove member | `Strands.removeMember(id, memberId)` | yes |

No delete-strand call exists in `ops.md` and none may be added.

## Member row

- Tap → sheet with *Start a strand with them* (→ InvitationGenerator, new strand) and *Rename for
  myself* (local); a manager also gets *Remove from this strand*, confirmed.
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
  does — it destroys the party's only copy of the strand's member key ([sereus.md](../../../specs/domain/sereus.md)).
- Storage figure for "Shared here" comes from the same source StrandMedia uses; compute once.
