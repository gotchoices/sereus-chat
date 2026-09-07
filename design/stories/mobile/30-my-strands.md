# User Story: My strands

## Story Overview

As somebody who is in more strands than fit on one screen
I want to see them all and get to the right one quickly
So that reaching a person is a glance and a tap, not a hunt.

Context: Bob has been using the app for a few months and is in fifteen or so strands — family, a
couple of coworkers, a cycling group. Some are alive daily, some he has not touched in weeks. This
is the screen he opens the app to, so it is the screen that has to be honest at a glance.

## Roles

| Role | Who | Note |
|------|-----|------|
| Owner of the list | Bob | it is his device's view of his strands, and nobody else's |

## Sequence

1. Bob opens the app and lands on his strands. Every strand he is in is here — there is no other
   place a conversation can hide.
2. Each row is a strand, not a person: a name, something of what was last said, and when. Most of
   his are with one other person and read as that person. The cycling group is four people and reads
   as the group.
3. What he sees of another member is what they chose to share — a name and, if they set one, a
   picture. Nothing else about them is his to see. → [31](31-whos-in-this-strand.md)
4. Where he has given somebody a name of his own, that is the name he sees. It is his private name
   for them and they are never told it.
5. He wants Sarah. He starts typing her name and the list narrows to match. → [32](32-finding-something.md)
6. He taps her strand and it opens where he left it. → [10](10-catching-up.md)

### Alternative Path A: she is not there

5.1. Nothing matches. He and Sarah have no strand — the list is the whole truth, so its silence is
     an answer rather than a doubt.
5.2. From here he can start one. What it takes is story [02](02-start-a-strand.md), including the
     part where he may have nowhere to be reached yet.

### Alternative Path B: nothing has been said yet

2.1. A strand Sarah accepted this morning sits in the list with nothing said in it.
2.2. It reads as a strand awaiting its first word, not as an empty or broken one. It is a real
     strand: it exists, both of them are in it, and either may speak first. → [04](04-our-first-conversation.md)

### Alternative Path C: ordering it his way

1.1. Bob would rather see what moved most recently, or read down the names, or put what is waiting
     on him at the top.
1.2. He chooses, and the choice sticks. He is not asked again every time he opens the app.

### Alternative Path D: putting one out of the way

1.3. A strand from a finished project still takes a row. He sets it aside. It leaves the list
     without leaving the app: nothing is deleted, nobody is told, and it comes back if somebody
     speaks in it.
1.4. Setting aside is not muting and not leaving. Those are different acts with different
     consequences, and they live in [33](33-managing-a-strand.md).

### Alternative Path E: some of it cannot be reached

1.5. Nothing holding one of Bob's strands is answering right now, so what was last said in it is
     not something his phone can state.
1.6. The strand is still listed — it exists and he is in it. What is missing is shown as not
     reachable right now, never as an empty conversation and never as one with nothing in it.
     → [42](42-staying-connected.md)

## Acceptance Criteria

- [ ] Every strand the user is in appears in one list; nothing is reachable only from elsewhere
- [ ] A row identifies the strand, what was last said, and when — enough to choose without opening it
- [ ] A group strand is shown as a group, not as one of its members
- [ ] Only what a member has shared of themselves is ever displayed; a private name the user has
      given somebody takes precedence and is never disclosed to them
- [ ] A strand with nothing said in it is distinguishable from one whose content cannot be reached,
      and neither reads as an error
- [ ] The user can order the list, and the choice is remembered between launches
- [ ] A strand can be set aside and comes back on new activity; this is distinct from muting and from
      leaving
- [ ] Narrowing the list by name is instant and needs nothing reachable — see [32](32-finding-something.md)
- [ ] Opening a row lands where the user left off, not at the top

## Variants

- happy: a dozen strands, mixed one-to-one and group, one opened
- empty: no strands yet — the first-run state, which is also where an invitation starts
- error: the list itself cannot be built

## Open

Nothing outstanding. How a group is titled and pictured when it has no single partner is settled by
`ops.md` returning a strand title and member count. Private names for partners are **provided by
sereus** and surfaced here rather than invented — sereus also intends, eventually, to group a user's
strands across sApps by that same private name, which is what would one day let a user cross from a
chat strand to a tally with the same person. Nothing here should make that harder.
