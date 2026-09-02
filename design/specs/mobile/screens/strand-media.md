---
id: strand-media
route: StrandMedia
variants: [happy, empty, error]
description: Everything shared in one strand, in one place.
---

# Strand Media

Stories 21, 32, 41.

## Purpose

Find what was shared without scrolling the conversation, and see what this strand is costing in
storage.

## Layout

- **Header**: "Shared here", with total count and size
- **Filter**: all · images · videos · files · voice
- **Grid**: newest first; files and voice as rows rather than tiles
- **Footer**: what this strand occupies, and a way to trim

## Item states

| State | Appearance |
|-------|-----------|
| Held here | Thumbnail |
| Fetching | Placeholder with progress; the grid stays usable |
| Not reachable now | Placeholder saying so — **never** an empty tile or a broken image |
| Removed by sender | Absent from the grid; a reply pointing at it says so, not this screen |

## Behaviours

- Tap → MediaViewer, with the current filter as the swipe set
- Long-press → save to device, or remove from this device
- Trim offers what is safe to describe: oldest first, or by kind, with the space it would recover
- Removing from this device never affects other members' copies, and says so once

## States

- **happy**: a grid with a mix of kinds
- **empty**: nothing has been shared here
- **error**: the collection cannot be listed

## Acceptance

- [ ] Media can be found without scrolling the conversation
- [ ] Fetching and unreachable are distinct, and neither renders as missing or broken
- [ ] The strand's storage cost is visible in ordinary units
- [ ] Trimming states what it recovers before it is done
- [ ] The screen never implies removing a local copy reaches anyone else
