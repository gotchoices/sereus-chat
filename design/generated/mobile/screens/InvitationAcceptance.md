---
provides: ["screen:mobile:InvitationAcceptance"]
needs: ["domain:Op:Invitations.inspect", "domain:Op:Invitations.accept"]
dependsOn:
  - design/specs/mobile/screens/invitation-acceptance.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/overview.md
  - design/stories/mobile/03-respond-to-an-invitation.md
  - design/stories/mobile/31-whos-in-this-strand.md
---

# Consolidation: InvitationAcceptance

## Purpose

Show what an invitation is for, and take accept or decline.

## Route

- `InvitationAcceptance` — modal over StrandList, from a deep link or the scanner
- Params: `{ token }`
- Mock: `sereus://screen/InvitationAcceptance?variant={happy|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Invitation is live and inspectable | happy |
| error | Spent, expired, cancelled, malformed | error |

## Data Requirements

```
Invitations.inspect(token) → InvitationPreview
InvitationPreview { inviterName, inviterAvatarUri|null,
                    strandState: StrandState, grantsInviteRight: bool,
                    status: 'live'|'spent'|'expired'|'cancelled'|'invalid' }
```

`strandState` is the same shape StrandDetail uses, so `StrandStatus` renders identically here. This
is the **most important placement of that component** — it is the one moment a person can judge a
strand before disclosing themselves.

## Implementation Notes

- Layout order matters and should not be rearranged: who is inviting → what the strand is → what
  the joiner will hold → actions. The consequences come before the buttons.
- "You will be able to read everything already said here" is stated for every strand, not only
  groups.
- Both primary choices carry **words**, not a tick and a cross: this is the most consequential
  decision in the app, and bare icons make somebody guess at it. "Join this strand" / "No thanks".
- The route title is **"Invitation"**, not "Accept invite" — the title must not presume the answer
  on the one screen whose purpose is deliberation.
- Three actions: Accept, Decline, and *Ask them to close it first* — the third is offered only when
  `strandState` is private-and-can-change. It performs **no** protocol action: it dismisses and
  returns the user to where they came from. It exists to name a possibility, not to send a request
  (story 31 — the ask is an ordinary message).
- Decline is local: create nothing, tell nobody.
- Error states are copy, not dialogs: "this invitation has already been used", with a way back and
  no retry button.

## Open

What an invitee can verify before joining is thin upstream — inspection may not be able to show the
member list or history size ([sereus.md](../../../specs/domain/sereus.md)). The adapter returns what it can; the screen shows only
what it is given and never guesses.
