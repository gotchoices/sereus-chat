---
provides: ["screen:mobile:InvitationGenerator"]
needs: ["domain:Op:Invitations.create", "domain:Op:Invitations.listOutstanding", "domain:Op:Invitations.cancel"]
dependsOn:
  - design/specs/domain/sereus.md
  - design/specs/project.md
  - design/specs/mobile/screens/invitation-generator.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/overview.md
  - design/specs/domain/interfaces.md
  - design/stories/mobile/02-start-a-strand.md
  - design/stories/mobile/05-add-someone-to-a-strand.md
  - design/stories/mobile/30-my-strands.md
  - design/stories/mobile/31-whos-in-this-strand.md
---

# Consolidation: InvitationGenerator

## Purpose

Mint an invitation — for a new strand, or into an existing one — share it, and manage outstanding
ones.

## Route

- `InvitationGenerator` — modal from the home header (new strand) or StrandDetail (add someone)
- Params: `{ strandId?, token? }`. Absence of both means "new strand". `token` opens an outstanding
  invitation (from StrandDetail's invitation rows) and continues in its strand.
- Mock: `sereus://screen/InvitationGenerator?variant={happy|empty|error}`

## Two modes, one screen

| Mode | Trigger | Extra step |
|------|---------|-----------|
| New strand | no `strandId` | Choose private or public first |
| Add to existing | `strandId` present | Show what history the joiner will hold |

Add-to-existing is only reachable when `canIManage`; the entry point is absent otherwise, rather
than present and disabled.

## Data Requirements

```
Invitations.create({ strandId?, visibility?, grantsInviteRight: bool }) → Invitation
Invitation { id, token, url, qrPayload, strandId|null, expiresAt|null, grantsInviteRight, spent }
Invitations.listOutstanding() → Invitation[]
Invitations.cancel(id)
```

**The platform seats a member from a bearer invitation and confers invite rights by a separate
signed act** — there is no "join as manager" invitation upstream ([sereus.md](../../../specs/domain/sereus.md)). The adapter hides
this; if the grant cannot be applied at admission without a manager present, that surfaces as the
grant landing late, and the screen must not promise it as instantaneous.

## Surface (fixed by the human spec)

- Read-only link with a **copy icon**; copying shows a brief "Copied" toast
- **QR toggle**, default **on**, with a scannable preview beneath it
- **Share** via the native sheet — link text always, QR image when the toggle is on
- **Regenerate** mints a new token and updates both link and QR
- The screen can simply be held up for a direct scan

## When the user cannot be reached

`createInvitation` fails when the node has no dialable address — the common state for a fresh
install, since a phone cannot listen. Story 02 Alt A: this is not an error the user caused, and it
must not be a dead end.

- Detect this case distinctly from other failures (the adapter surfaces it as a precondition, not a
  crash) and say what it prevents rather than what is missing
- Offer both routes without ranking them: a machine of their own, or borrowing a relay — the latter
  linking out to the listing at `sereus.org/chat/relays`
- Keep the terms already chosen. Returning from the detour must not mean re-entering them

## Implementation Notes

- The private/public choice is two labelled cards with consequences as body text, not a switch.
  Public is not the default and is not presented as the simpler option.
- The invite-rights control is a single switch, off by default, captioned with what it confers:
  the ability to add **and remove** people, including the person granting it.
- QR rendered locally; never round-trip a token through any service to make an image.
- Share row: show QR · copy link · device share sheet · **post into the strand** (only in
  add-to-existing mode). The last carries the standing warning that an invitation works for whoever
  holds it.
- **The strand comes first** (story 02, as amended): the first invitation for a new strand founds
  it, and every later one from this screen, including "Make another invitation" (which serves the
  spec's Regenerate), goes into that same strand. Once founded, the private/public choice is shown
  as fixed.
- Outstanding list beneath, **scoped to this strand** (filter `listOutstanding()` by `strandId`).
  Before the first invitation of a new strand there is no strand yet, so the list is empty. Each row
  offers "Share again" and "Take it off the list".
- **"Take it off the list" is not abandon.** The control schema supports an owner-signed delete of
  the `FormationInvite` row, but cadre-core exposes no call for it, so `cancel` only stops listing
  it. The invitation works for whoever holds it until it expires, and the confirmation says so.
  Restore "abandon" when upstream can withdraw.
- Nothing on this screen may render a not-yet-accepted invitation as a strand of its own. It is part
  of the strand it leads into, and is seen there (StrandDetail).

## Libraries

- `react-native-qrcode-svg`
- `Share` from react-native
