# User Story: Managing a strand

## Story Overview

As someone whose list has filled up with strands  
I want to quiet, step away from, or be rid of a strand I no longer want  
So that my list reflects the conversations I actually have, and I know what each of those acts costs me.

Context: Bob exchanged a few polite messages with Dave after a conference six months ago and it
never went anywhere. He is also in a cycling group strand that is far busier than his interest in
it. He wants to tidy up, and does not want to discover afterwards that he threw something away.

## Roles

| Role | Who | Note |
|------|-----|------|
| The one tidying up | Bob | acts only for himself; nothing he does here reaches anyone else |
| Other members | Dave, the cycling group | carry on regardless |

## Sequence

1. Bob finds the strand with Dave in his list and looks at what he can do about it.
2. He is offered three things, and told what each one costs before he picks. There is no fourth
   option that removes the strand from the world — it is not his to remove.
3. **Mute.** He stays in the strand and his machines carry on taking part. Messages still arrive; he
   simply is not told about them. He chooses how quiet: silent unless somebody names him, or silent
   whatever happens. Either way he finds everything when he looks. → [10](10-catching-up.md)
4. **Leave.** His machines stop taking part. Nothing more reaches him, and the strand carries on
   without him for everyone still in it. He keeps what identifies him in that strand, so if Dave
   ever invites him back he returns as himself, with what was said before still his.
5. **Forget it entirely.** Leaving, and then discarding what identifies him and what he holds of the
   strand. This one cannot be undone. He is told the specific consequence rather than a generic
   warning: if he is ever invited back he arrives as a stranger — a new member — and the messages he
   sent before stay attributed to who he used to be.
6. Bob picks leave. Dave's strand is gone from his list; Dave is not told, and sees only that Bob
   has gone quiet.
7. Nothing about this touched Dave's copy, or anyone else's. → [31](31-whos-in-this-strand.md)

### Alternative Path A: too noisy, not unwanted

1.1. It is the cycling group Bob wants quieted, not ended — he still wants to read it when he
     chooses.
1.2. He mutes it, choosing to still hear it if anyone names him directly — he wants out of the tyre
     pressure argument, not out of the group. It stops interrupting him otherwise and stays exactly
     where it was, with everything still arriving.

### Alternative Path B: coming back

6.1. A year later Dave invites Bob to that same strand again.
6.2. Because Bob only left, and kept what identified him, he comes back as himself. The
     conversation picks up where it stopped rather than starting over.

### Alternative Path C: making sure first

5.1. Before forgetting a strand for good, Bob realises it holds documents and photos he may want.
5.2. He is able to keep what matters to him before the rest goes. → [21](21-receiving-media.md)

### Alternative Path D: the last one there

4.1. Everyone else has already left a strand and Bob is the only member remaining.
4.2. Leaving it now ends it, because nobody is left to carry it. He is told that this is what is
     about to happen, rather than finding out afterwards.

### Alternative Path E: a member who keeps talking

6.1. Dave carries on sending messages after Bob has left.
6.2. They do not reach Bob, and he is not troubled by them. Dave is not told he has been left; he
     sees somebody who has stopped answering, which is what has in fact happened.

## Acceptance Criteria

- [ ] The user is offered muting, leaving, and forgetting entirely, and is told what each costs
      before choosing
- [ ] No option claims to delete a strand for its other members
- [ ] Muting keeps the user fully in the strand; only notification stops
- [ ] The user chooses whether a mute still lets through messages that name them
- [ ] Leaving stops the user's machines taking part, and the strand continues for everyone else
- [ ] Leaving preserves what identifies the user in that strand, so returning later is returning as
      the same person
- [ ] Forgetting entirely is permanent, is marked as permanent, and is described in terms of what it
      costs: a later return is as a new member, and earlier messages stay attributed to who the user
      was
- [ ] The remaining members are not notified when someone leaves
- [ ] A user leaving a strand where they are the last member is told that this ends it
- [ ] The user can keep content that matters to them before forgetting a strand
- [ ] Nothing offered here reaches another member's copy

## Variants

- happy: a dead strand left, list tidied
- empty: a list with nothing worth tidying
- error: forgetting a strand the user meant only to leave

## Open

Whether **archiving** — merely hiding a strand from the main list while everything continues — is
worth keeping as a fourth, purely cosmetic act, or whether muting covers the need. The earlier
version of this story offered archiving and blocking; blocking is gone, since leaving is what stops
messages arriving.

Someone who forgets a strand and is later invited back returns as a new member. Confirming that
upstream would settle how the member list and old messages present them.
