# User Story: Who's in this strand

## Story Overview

As a member of a conversation with other people in it  
I want to see who is here and what any of us can do about that  
So that I know who is reading what I say, and on whose sufferance I am here.

Context: The cycling group ([05](05-add-someone-to-a-strand.md)). Bob and Priya can add and remove
people; the rest cannot. Tom joined last month. Susan is a member with a request.

## Roles

| Role | Who | Can add and remove |
|------|-----|--------------------|
| Manager | Bob, Priya | yes — including each other |
| Member | Susan, Tom, the rest | no |

## Sequence

1. Bob looks at who is in the strand. He sees everyone, and can tell at a glance which of them can
   add and remove people and which cannot.
2. He can see what the strand *is*, in terms he does not have to interpret: private, and still able
   to change, because he and Priya can both add and remove.
3. That is two facts about him rather than one, and the app does not soften either. People he has
   never met may yet be brought in and read what he says here. And he can be put out of it, by
   either of the two people who hold that ability — one of whom is himself.
4. He looks at Tom's entry. He can see that Tom belongs to the strand, along with whatever else the
   platform can tell him, and nothing Tom has not chosen to show. There is no address here, and
   nothing that would let Bob reach him elsewhere.
5. Half expecting to message Tom privately, Bob taps him. He cannot. No private conversation between
   them exists, and none can be started from here — Tom is a member of this strand, not an address.
   A conversation of their own would take a new strand and Tom accepting it
   ([02](02-start-a-strand.md)).
6. Bob decides he would rather not be one of the people who can add and remove. He gives it up, and
   is told plainly what he is giving up and that it cannot be taken back — not by him, not by anyone.
7. What the strand is has changed, and it changes for everyone at once. Priya alone can now add and
   remove; the strand still says it can change, because it still can.

### Alternative Path A: asking somebody else to give it up

7.1. The group would rather nobody could bring anyone else in. Bob asks Priya to give up hers too —
     by saying so, in the conversation, like anything else he might say.
7.2. There is nothing else to it. No request to raise, nothing pending, nothing counting who agrees,
     and nothing reminding Priya she has not answered. She can reply, ignore it, or say no, and none
     of those is a state the app tracks. It is a conversation among people who can already talk to
     each other.
7.3. She agrees. Now nobody can add anyone and nobody can remove anyone: the membership is settled
     for good, everyone is here on the same footing, and everyone can see it.
     → [05](05-add-someone-to-a-strand.md)

### Alternative Path B: the one who stopped showing up

7.1. Instead, Priya stops appearing. Months pass.
7.2. She is still shown as able to add and remove, because that is what is recorded. Whether she lost
     her phone, gave up cycling, or is simply quiet is not something anybody can know, and the app
     does not guess — there is no notion here of a person being *gone*.
7.3. So the strand still reads as able to change, which is the honest answer even though in practice
     nobody is going to change it.
7.4. Had Bob kept his own ability he could have taken hers, leaving her a member like anyone else.
     He gave his up first, so nobody can. That is the cost of going first, and the group is left
     waiting on somebody who may never come back.

### Alternative Path C: what a newcomer already knows

4.1. Tom can read everything the group said before he arrived, including the parts from a year ago.
4.2. This surprises nobody, because it was said plainly when he was invited, to the person doing the
     inviting, before the invitation went out ([05](05-add-someone-to-a-strand.md)).
4.3. The member list is not where anybody learns this for the first time, and there is nothing here
     to switch it off.

### Alternative Path D: getting somebody in when you cannot invite

1.1. Susan wants her partner in the group. She cannot invite, and cannot reach Bob or Priya privately
     from here either.
1.2. So she asks in the strand, in front of everyone. That is the ordinary way, and it works.
1.3. Bob can hand her an invitation to pass on. If he posts it into the strand he is told what that
     really does: an invitation is good for whoever holds it, so posting it hands **every** member a
     one-off ability to bring somebody in. That is a real transfer of the thing he holds, not a
     convenience.
1.4. Given any other way of reaching Susan, he uses it. Posting into the strand is the fallback, and
     the app describes it as one.

### Alternative Path E: put out

7.1. A member is removed by somebody who can do that.
7.2. Everybody sees they are no longer here. What reaches the removed member, and what it cannot
     undo, is [33](33-managing-a-strand.md).

## Acceptance Criteria

- [ ] A member can see everybody in the strand, and which of them can add and remove people
- [ ] The strand's state is legible without interpretation: public, private and able to change, or
      private and settled
- [ ] A member is told both consequences of a strand that can change — who may yet read this, and
      that they themselves may be put out
- [ ] A member's entry shows only what that member has disclosed, and offers no way to reach them
      elsewhere
- [ ] Tapping a member offers neither a private conversation nor a direct invitation; neither exists
- [ ] A member holding the ability may give it up, is told it is permanent, and it is
- [ ] Giving it up changes what the strand is, visibly, for every member at once
- [ ] Asking another member to give up the ability is an ordinary message and nothing more: no
      request to raise, no pending state, no tally of who agrees, no reminder that it is unanswered
- [ ] Somebody who has stopped participating is still shown as holding what they hold; the app never
      infers that a person is gone
- [ ] Posting an invitation into a strand is described as handing every member a one-off ability to
      admit somebody
- [ ] A member can see who belongs to the strand, together with whatever else the platform can tell
      them about it
- [ ] A member notices when the membership has changed

## Variants

- happy: a member reads the room, then gives up what they hold
- empty: a two-party strand, where the list is short and the question barely arises
- error: a strand waiting on somebody who has stopped appearing

## Open

How much of a strand's past is knowable — who admitted whom, who removed whom, when somebody joined
— is **the platform's to say**, and this story is deliberately vague about it. Sereus replicates the
current member and manager sets; whether anything further is reachable is not settled, though the
layers underneath are log-structured and may well hold it. The app does **not** keep its own record:
one participant's private account of who did what would be unverifiable by anyone else and would
drift between members, which is worse than not having it. If some detail turns out to be genuinely
needed, that is an issue to raise upstream rather than something to reconstruct here.

Private nicknames for members are roadmap rather than present ([sereus.md](../../specs/domain/sereus.md)); until they exist,
everyone sees the same display name.
