---
provides: ["screen:mobile:Settings"]
needs: ["domain:Op:Prefs.get", "domain:Op:Prefs.set", "domain:Op:Storage.usage"]
dependsOn:
  - design/specs/mobile/screens/settings.md
  - design/specs/mobile/navigation.md
  - design/specs/mobile/global/ui.md
  - design/specs/mobile/global/i18n.md
  - design/specs/domain/overview.md
  - design/stories/mobile/41-settings.md
  - design/stories/mobile/42-staying-connected.md
---

# Consolidation: Settings

## Purpose

Appearance, language, notification default and storage. Device-scoped.

## Route

- `Settings` — push from Profile
- Mock: `sereus://screen/Settings?variant={happy|error}`

## UI States

| State | Trigger | Mock variant |
|-------|---------|--------------|
| happy | Prefs load | happy |
| error | Storage usage unavailable; rest still usable | error |

## Data Requirements

```
Prefs { theme: 'system'|'light'|'dark', language: string,
        notifyDefault: 'all'|'mentions'|'none', storageCeilingBytes: number|null }
StorageUsage { totalBytes, byStrand: [{ strandId, title, bytes }] }
```

All prefs are **device-local** (MMKV/AsyncStorage). Nothing here goes into a strand, and nothing
replicates — settings deliberately sidestep the missing party-private store (sereus#6).

## Implementation Notes

- Four sections, in the spec's order. **Do not add sections.** No account, sign-out or privacy
  group exists; their absence is designed, and a future contributor should find that stated here.
- Notification section carries an inline note when the platform cannot wake a sleeping device:
  the setting governs what the app does, not whether anything can reach the phone. Link through to
  CadreManager rather than explaining twice (story 42).
- Per-strand overrides are **displayed but not editable** here — a read-only count ("3 strands have
  their own setting") linking to nothing. Editing happens on the strand. This prevents the general
  setting silently reaching into particular ones.
- Storage: list strands descending by bytes, each row routing to that strand's StrandMedia.
  Reaching the ceiling is surfaced as a banner with three actions and no automatic deletion.
- Theme changes apply immediately through the existing `ThemeProvider`; language through i18n with
  a full re-render. Neither touches message content.

## Libraries

- Existing `src/theme/` ThemeProvider
- MMKV or AsyncStorage for prefs
