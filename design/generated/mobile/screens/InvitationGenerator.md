---
provides: ["screen:mobile:InvitationGenerator"]
needs: ["domain:Op:Invitations.create", "domain:Op:Invitations.listOutstanding", "domain:Op:Invitations.cancel"]
dependsOn:
  - design/specs/mobile/screens/invitation-generator.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/overview.md
  - design/specs/domain/interfaces.md
  - design/stories/mobile/02-start-a-strand.md
  - design/stories/mobile/05-add-someone-to-a-strand.md
  - design/stories/mobile/31-whos-in-this-strand.md
---

# Consolidation: InvitationGenerator

## Purpose

Mint an invitation — for a new strand, or into an existing one — share it, and manage outstanding
ones.

## Route

- `InvitationGenerator` — modal from the home header (new strand) or StrandDetail (add someone)
- Params: `{ strandId? }` — absence means "new strand"
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

## Implementation Notes

- The private/public choice is two labelled cards with consequences as body text, not a switch.
  Public is not the default and is not presented as the simpler option.
- The invite-rights control is a single switch, off by default, captioned with what it confers:
  the ability to add **and remove** people, including the person granting it.
- QR rendered locally; never round-trip a token through any service to make an image.
- Share row: show QR · copy link · device share sheet · **post into the strand** (only in
  add-to-existing mode). The last carries the standing warning that an invitation works for whoever
  holds it.
- Outstanding list beneath, with relative expiry, re-share and abandon. Abandon calls `cancel` and
  is irreversible; confirm it.
- Nothing on this screen may render a not-yet-accepted invitation as a strand.

## Libraries

- `react-native-qrcode-svg`
- `Share` from react-native
