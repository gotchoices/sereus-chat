# User Story: Add someone to a strand

## Story Overview

As someone who can invite people into a strand  
I want to bring another person into a conversation that already exists  
So that they can take part — knowing what that costs the people already in it.

Context: Bob's cycling group has been running for months ([02](02-start-a-strand.md)). He and Priya
can invite; the rest cannot. Tom has started turning up on the Saturday ride and should be in it.
Bob also has a strand with his brother that he closed for good, and will find out what that means.

## Roles

| Role | Who | Can invite |
|------|-----|------------|
| Manager | Bob, Priya | yes, and can decide whether the person they invite may too |
| Member | the rest of the group | no |
| Newcomer | Tom | arrives holding everything said before he existed to them |

## Sequence

1. Bob wants Tom in the cycling strand. He invites from inside the strand — this invitation belongs
   to the strand, not to Tom. Nothing about it names him.
2. Bob decides one thing about it: whether whoever takes it up will be able to invite people
   themselves. He and Priya are enough, so he does not pass it on.
3. Before it goes anywhere, Bob is told what he is about to hand over. Everything the group has ever
   said becomes readable by whoever accepts, including the parts from long before they were thought
   of. He can see how much that is, so it is a real quantity rather than a warning he skims.
4. He also sees that this is not his decision to make privately — the others are in this strand too,
   and what they said is part of what he is passing on.
5. He shares the invitation with Tom the way he would reach him anyway, and directly, because
   whoever holds it can use it.
6. Tom takes it up and joins.
7. Everyone in the strand sees Tom arrive — not just Bob — and can see who let him in.
8. Nothing about what the strand *is* has changed. It could grow before and it can grow now, and it
   still says so. → [31](31-whos-in-this-strand.md)

### Alternative Path A: a member who cannot invite

1.1. Susan is in the group but is not one of the people who can invite, and wants to bring her
     partner along.
1.2. She has no way to do it. She is told plainly that she cannot invite here, and who can.
1.3. So she asks Bob. That is a conversation between two people, not a request the app adjudicates,
     queues, or nags anyone about.

### Alternative Path B: a strand nobody can add to

1.1. Bob wants to bring his sister into the strand he has with his brother.
1.2. There is no way to. He and his brother both gave up the ability to invite when they closed it
     ([02](02-start-a-strand.md)), and that cannot be taken back.
1.3. The app does not present this as a fault or offer a way around it. It is what Bob chose, and
     the reason it is worth anything is precisely that he cannot undo it now.
1.4. To include his sister he starts a new strand with all three of them. The old conversation does
     not come with it, and he is not misled into thinking it might.

### Alternative Path C: not depending on Bob

2.1. The group is growing and Bob does not want it waiting on him.
2.2. He invites the next rider with the ability to invite passed on, so there is more than one
     person who can bring someone in.
2.3. Everyone can see that this strand now has more people who can add to it, because that is the
     thing worth knowing about it.

### Alternative Path D: closing it once everyone is in

8.1. The group has who it is going to have, and the members would rather it stayed that way.
8.2. Bob gives up his ability to invite. That is not enough on its own — Priya can still add people,
     and the strand still says so.
8.3. Priya gives hers up too. Now nobody can add anyone, the strand is settled for good, and
     everyone can see it. Neither of them can reverse it.

### Alternative Path E: an invitation that reaches the wrong hands

5.1. Bob leaves the invitation somewhere less careful than he meant to, and a stranger takes it up.
5.2. They are in. Everyone sees them arrive, and nobody can put them out — there is no power to
     remove a member, only each member's own ability to leave.
5.3. What the group has already said is theirs now. The honest remedy is to start again elsewhere,
     and the app should say so rather than offering a control that would not work.

## Acceptance Criteria

- [ ] Inviting into an existing strand is possible only for members who hold that ability
- [ ] A member who does not hold it is told so plainly, and told who does
- [ ] The app does not mediate, queue or chase a request to be invited
- [ ] An invitation belongs to a strand, not to a named person, and whoever takes it up joins
- [ ] The inviter decides whether the person joining may invite others
- [ ] Before an invitation is issued, the inviter is shown that the newcomer will hold everything
      already said, and how much that is
- [ ] Every member sees a newcomer arrive, and who invited them
- [ ] A strand nobody can add to reads as settled rather than broken, with no way around it offered
- [ ] Including someone in a settled strand means starting a new one, and the old history does not
      follow
- [ ] A strand is settled only when nobody at all can invite; one person giving up the ability is
      not enough while another retains it
- [ ] Giving up the ability to invite is permanent
- [ ] No member can be removed by anyone else

## Variants

- happy: a newcomer invited, arriving, and visible to everyone
- empty: a settled strand, where the act is simply not available
- error: a member who cannot invite; an invitation taken up by the wrong person

## Open

Whether an **existing** member can be given the ability to invite after the fact, or only at the
moment they are invited, is unconfirmed — the upstream account describes invitations carrying it
(`STATUS.md` Appendix). Alt C assumes the latter and works either way.

Alt E assumes **no member can be removed by anyone**, which follows from the permission model being
only the granting of invite rights, but is worth confirming. If removal ever existed it would change
this story materially.
