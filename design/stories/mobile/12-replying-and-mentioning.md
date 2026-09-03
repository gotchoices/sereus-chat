# User Story: Replying and mentioning

## Story Overview

As someone in a conversation with several people talking at once  
I want to answer a particular message and get a particular person's attention  
So that a busy strand stays legible, and so that being needed is distinguishable from being present.

Context: The cycling group ([05](05-add-someone-to-a-strand.md)) has three subjects running at once —
Saturday's route, Tom's broken derailleur, and somebody's new wheels. Bob has the strand softly
muted ([10](10-catching-up.md)): quiet unless he is named.

## Roles

| Role | Who | Note |
|------|-----|------|
| Writer | Bob | answers one message, names one person |
| Named | Tom | has the strand quieted, and is reached anyway |
| Others | Priya, the rest | not interrupted by any of this |

## Sequence

1. Bob wants to answer something said twenty messages ago, which by now is well out of sight.
2. He replies to that particular message. His answer carries what it is answering, so anybody
   reading later can see what he was responding to without going to look for it.
3. What his reply carries is a **reference**, not a copy — tapping it goes to the original, in place,
   with everything around it.
4. His answer stays in the conversation, in the order everything else is in. It does not disappear
   into a side thread that has to be found and opened.
5. He wants Tom in particular to see it, so he names him. He can only name people who are in this
   strand — there is nobody else he could name, because there is no directory and no strangers here.
6. Tom is reached, even though he has the strand quieted, because being named is exactly what a soft
   mute lets through ([33](33-managing-a-strand.md)). Nobody else is interrupted.
7. Bob named Tom by the name **Bob** has for him. Tom sees himself named; Priya sees the name *she*
   has for Tom. A mention is a reference to a member, not a piece of text, so each person reads it in
   their own terms and nobody's private name for anybody leaks.
8. Priya thinks that settles it, and reacts to Bob's answer rather than adding a fourteenth message.
   The reaction interrupts nobody. → [10](10-catching-up.md)

### Alternative Path A: the message being answered is removed

2.1. Later, the author removes the message Bob replied to ([13](13-correcting-a-message.md)).
2.2. Bob's reply stays where it is and still reads as a reply. What it points at is gone, and it says
     so plainly rather than quietly presenting itself as an answer to nothing.
2.3. Nothing works to hide that something was there.

### Alternative Path B: naming somebody who has left

5.1. Bob names a member who has since left the strand.
5.2. The mention still resolves to who they were, so old conversation stays readable. It does not
     reach them, and does not pretend to.
5.3. Naming somebody who is not in this strand is not offered at all — not as a failure, simply as
     something that does not exist here.

### Alternative Path C: quieted completely

6.1. Tom has this strand hard-muted rather than softly ([33](33-managing-a-strand.md)).
6.2. Being named does not reach him. He asked for silence and gets it; the app does not decide that
     this particular message has earned an exception.
6.3. He can see he was named the next time he looks, distinct from the rest of the traffic.

### Alternative Path D: changing a reaction

8.1. Priya reacts, then thinks better of it and removes it, or picks a different one.
8.2. Anybody can see who reacted and with what — a reaction is attributable, not an anonymous tally.
8.3. Removing one leaves nothing behind, in the same way a message does not.

### Alternative Path E: a reply between two people

1.1. In a two-party strand there is rarely any doubt about what is being answered.
1.2. Replying still works and is occasionally worth it — picking up something from last week — but
     nothing pushes Bob towards it when it would only add ceremony.

## Acceptance Criteria

- [ ] A member can reply to a particular message, and the reply carries what it answers
- [ ] What a reply carries is a reference; following it goes to the original in place
- [ ] Replies stay in the conversation rather than in a separate thread
- [ ] A member can name another member, and can name only members of this strand
- [ ] Being named reaches a member who has softly muted the strand, and never one who has muted it
      completely
- [ ] Being named is distinguishable from the strand merely being busy
- [ ] A mention resolves to a member, so each reader sees the name they themselves use for that
      person, and no private name is disclosed to anybody
- [ ] A mention of somebody who has left still resolves to who they were, and does not reach them
- [ ] Reactions interrupt nobody
- [ ] A reaction shows who made it; a member can change or remove their own
- [ ] A reply to a message that is later removed stays intact and says plainly that what it answered
      is gone

## Variants

- happy: a reply and a mention in a busy group, answered with a reaction
- empty: a strand with nothing yet worth replying to
- error: replying to, or naming, something or somebody no longer there

## Open

Each reader seeing their own name for a mentioned member depends on private nicknames, which are
roadmap rather than present ([sereus.md](../../specs/domain/sereus.md)). Until they exist, a mention falls back to the
member's shared display name, which is the same for everyone — the story's behaviour is correct, the
distinction simply has nothing to bite on yet.
