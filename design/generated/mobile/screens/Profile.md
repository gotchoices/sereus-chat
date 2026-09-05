---
provides: ["screen:mobile:Profile"]
needs: ["domain:Op:Profile.get", "domain:Op:Profile.save"]
dependsOn:
  - design/specs/mobile/screens/profile.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/domain/schema.md
  - design/stories/mobile/40-my-profile.md
  - design/stories/mobile/01-first-run.md
---

# Consolidation: Profile

## Purpose

The user's own name and picture, what of it other people see, and the way through to Settings and
CadreManager.

## Route

- `Profile` — push from the StrandList footer avatar
- Also serves the **first-run name prompt**, presented as a modal with only the name field
- Mock: `sereus://screen/Profile?variant={happy|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Profile loads | happy |
| firstRun | No profile yet — name only, no back | — |
| error | Save fails; input preserved | error |

## Data Requirements

`Profile.get()` / `Profile.save(data)` — `{ name, avatarUri, email?, phone?, notes? }`, device-local
storage only (`domain/schema.md`).

The human spec fixes the field list: **Name (required), Email, Phone, Notes/Bio**, with the avatar
carrying an edit affordance. Email, phone and notes never leave the device.

**Only `name` and `avatarUri` are shared** — they become the user's `Member` row in each strand.
Everything else never leaves the device. The screen must mark this distinction visibly; it is the
one place the user can see what they are disclosing.

## Implementation Notes

- First run: same screen, `firstRun` mode — name field, Continue, and an option to fill in more.
  No account language anywhere; the absence of a password field is the point (story 01).
- Avatar change → MediaPicker (camera / library / files) → crop → preview → save.
  Oversized images offer downscaling rather than refusal.
- Save validates a non-empty name and nothing else.
- Unsaved-changes guard on back.
- Two rows at the foot: Settings, and "My network" → CadreManager (identity, machines, relays). The cadre screen is a shared
  component (`src/cadre-ui/`) and is not designed here (story 42).
- A one-line note, shown once and dismissible, that in a strand which can still grow, people the
  user has not met may come to see their name and picture.

## Libraries

- MMKV / AsyncStorage; existing MediaPicker route
