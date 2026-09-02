---
id: search-interface
route: SearchInterface
variants: [happy, empty, error]
description: Progressive search across strands or within one.
---

# Search

Story 32. Rewritten against what the platform can actually do.

## Purpose

Find something that was said, without pretending the search is instant or that a partial sweep is a
finished answer.

## Scope

Two scopes, chosen before or during: **this strand**, or **everything**. In-strand search is the
common case and should be one tap from the conversation.

## The honest shape of it

Searching everything means visiting every strand, and most strands are not running until something
wakes them. So search is **progressive**:

- Results appear as they are found, ordered by relevance within what has arrived
- Progress is visible — how many strands have been looked at, and how many remain
- The user can act on a result before the sweep finishes
- When strands cannot be reached, the result set says so explicitly, naming how many were skipped

A search that has not finished must never present itself as complete.

## Filters

Kind (text · images · videos · files · voice), date range, and sender within a strand. Filters
narrow what is searched, not merely what is displayed, so they make a sweep cheaper.

## Results

Each row: which strand, who said it, a snippet with the match marked, and when. In an "everything"
search the strand is the first thing on the row — a match means nothing without it.

Tapping a result opens that strand positioned on that message.

## States

- **idle**: recent searches, and nothing else
- **searching**: progressive results with a progress line
- **happy**: results, sweep complete
- **partial**: sweep complete except for strands that could not be reached; stated on the results
- **empty**: nothing matched, sweep complete
- **error**: the search could not run

## Acceptance

- [ ] Results appear before the sweep finishes and are usable immediately
- [ ] An unfinished or partial search is never presented as complete
- [ ] Strands that could not be searched are counted and named as such
- [ ] Every result in a cross-strand search shows which strand it came from
- [ ] Tapping a result lands on that message in place
