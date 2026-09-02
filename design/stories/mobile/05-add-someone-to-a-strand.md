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
7. Everyone in the strand sees that Tom is now here — not just Bob.
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
2.2. He gives an existing member the same ability he has, without their having to leave and come
     back. He can also pass it on to somebody at the moment he invites them.
2.3. He is told what he is handing over, and it is more than convenience. That person will be able
     to bring people in and to put people out — **including Bob**. Everyone holding this ability
     holds it over everyone else who does; there is no seniority, and nothing protects the person
     who started the strand.
2.4. Bob decides that is fine, because it is Priya. That is the actual basis for the decision, and
     the app presents it as such rather than as an administrative setting.

### Alternative Path D: closing it once everyone is in

8.1. The group has who it is going to have, and the members would rather it stayed that way.
8.2. Bob gives up his ability. That is not enough on its own — Priya still has hers, and the strand
     still says so.
8.3. He is told the position he has just put himself in, plainly and once: he can no longer remove
     anyone, and Priya still can, including him. Between his act and hers, he is there on her
     goodwill. Somebody has to go first, and the app does not pretend otherwise.
8.4. Priya gives hers up too. Now the membership is fixed in both directions: nobody can be added
     and nobody can be put out. Everyone in it is there for good, on equal terms, and can see that
     they are. Neither Bob nor Priya can reverse it.

### Alternative Path E: a strand that needs no invitation

1.1. The strand Bob wants Tom in is a public one — anybody holding its link can join.
1.2. There is nothing for Bob to do. Nobody is invited here, because nobody has to be, and there is
     no ability to hold. He passes on the link and Tom joins on his own.
1.3. Nor could Bob put anyone out. Nobody is in charge of a public strand, and that cuts both ways:
     no stranger can be excluded, and neither can any member.

### Alternative Path F: an invitation that reaches the wrong hands

5.1. Bob leaves the invitation somewhere less careful than he meant to, and a stranger takes it up.
5.2. Everyone sees them arrive. Bob can put them out again, because the ability to bring people in
     is the same ability that removes them.
5.3. He does, and is told plainly what that achieves and what it cannot. Nothing further reaches
     them. Everything they could already read, they hold — ejecting somebody is not un-telling them.
5.4. Whether the group carries on here or starts again elsewhere is a judgement the members make.
     The app does not pretend the removal undid anything.

## Acceptance Criteria

- [ ] Inviting into an existing strand is possible only for members who hold that ability
- [ ] A member who does not hold it is told so plainly, and told who does
- [ ] The app does not mediate, queue or chase a request to be invited
- [ ] An invitation belongs to a strand, not to a named person, and whoever takes it up joins
- [ ] The inviter decides whether the person joining may invite others
- [ ] Before an invitation is issued, the inviter is shown that the newcomer will hold everything
      already said, and how much that is
- [ ] Every member can see that somebody new has arrived, not only whoever invited them
- [ ] A strand nobody can add to reads as settled rather than broken, with no way around it offered
- [ ] Including someone in a settled strand means starting a new one, and the old history does not
      follow
- [ ] A member holding the ability may pass it to an existing member, not only to someone being invited
- [ ] Passing it on is described as conferring both adding and removing, not merely convenience
- [ ] A member holding the ability may remove another member, including one who also holds it
- [ ] Passing the ability on is described as conferring power over the giver as well; nothing
      privileges whoever started the strand
- [ ] A member giving up the ability while another retains it is told they are now removable by them
- [ ] In a public strand nobody is invited and nobody can be removed, and the app offers neither
- [ ] Removal is described accurately: it stops anything further reaching them and undoes nothing
      they could already read
- [ ] A strand is settled only when nobody at all holds the ability; one person giving it up is not
      enough while another retains it
- [ ] A settled strand is fixed in both directions — nobody can be added, and nobody can be removed
- [ ] Giving up the ability is permanent

## Variants

- happy: a newcomer invited, arriving, and visible to everyone
- empty: a settled strand, where the act is simply not available
- error: a member who cannot invite; an invitation taken up by the wrong person

## Open

Whether two managers can give up the ability **together**, so neither is exposed to the other in
between, or whether somebody must always go first on trust. Alt D assumes the latter and says so
honestly; if the platform can coordinate it, that path gets kinder.

Alt F assumes removal actually stops things reaching the removed member. In the current source it
does not — the read gate is a shared key they keep — and whether the intended design fixes that is
the first open question in `STATUS.md` §G. If it does not, this path needs rewriting: the only real
remedy would be starting again elsewhere.

Whether a removed member can be invited back, and whether they return as themselves, is unsettled —
it likely turns on the same key question as leaving and returning ([33](33-managing-a-strand.md)).
