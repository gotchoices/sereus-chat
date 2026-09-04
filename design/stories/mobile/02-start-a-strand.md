# User Story: Start a strand

## Story Overview

As someone with nobody to talk to yet  
I want to invite a person I know into a conversation  
So that we can talk, and so that I know who will ever be able to read it.

Context: Continues from [01](01-first-run.md). Bob has the app and no strands. Susan is in the next
cubicle. Bob's brother Mike is not.

## Roles

| Role | Who | Note |
|------|-----|------|
| Inviter | Bob | creates the strand and shares the invitation |
| Invitee | Susan, Mike | receives it out of band; their side is [03](03-respond-to-an-invitation.md) |

## Sequence

1. Bob starts a strand. He is not asked to look anybody up — there is no directory — only to say
   what kind of thing he is making.
2. He chooses **private**: only people he invites can be in it, and somebody — him, to begin with —
   decides who those are. The alternative is public, which anyone holding the link can join and from
   which nobody can be removed, because nobody is in charge of it.
3. He creates an invitation for the person he has in mind, and decides one thing about it: whether
   the person who takes it up can invite others, as he can.
4. This is his brother, so he does not pass that on.
5. He can see what the strand is, plainly and without asking: private, and open to growing, because
   Bob himself can still add people. The app does not treat this as a problem — it is simply what is
   true right now, and he can see it at a glance.
6. He gets the invitation as a QR code on screen, and as a link for when the person is not in front
   of him.
7. He can share the link however he would normally reach that person — message, email, print. The
   app does not send it for him, because it has no way to reach anyone.
8. Susan is right there, so he holds up his phone and says "scan this".
9. He can see the invitation is outstanding, and that nothing exists yet — there is no strand until
   someone accepts. → [03](03-respond-to-an-invitation.md)

### Alternative Path A: nowhere to be reached yet

6.1. Bob asks for the invitation and cannot have one. Nothing of his can be reached from outside, so
     there is nowhere for Susan to answer. It is not that she may not reach him — that is the point
     of the app — it is that she *could* not.
6.2. He is told this in his own terms, and it is not framed as an error he caused. Nobody's phone is
     reachable on its own; this is the ordinary starting position.
6.3. He is offered two ways out. Something of his own that stays awake — his to run, nobody else
     involved. Or borrowing somebody else's for now, which is quicker and costs him something he
     should understand first. → [42](42-staying-connected.md)
6.4. Whichever he chooses, the terms he already set are not thrown away. He comes back and the
     invitation is there to be made.

### Alternative Path B: closing it for good

9.1. Susan has joined, and Bob wants this to stay between the two of them permanently.
9.2. He gives up his own ability to add people. He is told exactly what he is giving up and that it
     cannot be taken back — not by him, not by anybody, not ever.
9.3. He does it. What the strand is has changed, and both of them can see it: nobody here can add
     anyone or remove anyone, so its membership is settled for good and they are in it on equal
     terms. → [31](31-whos-in-this-strand.md)
9.4. If he had wanted a group of four instead, he would have invited three people first and given
     it up afterwards. The act is the same; when he does it is what fixes the size.

### Alternative Path C: someone who is not in the room

7.1. Bob wants to invite his brother Mike, who is across town. He sends the link by text.
7.2. He gets impatient and sends the same link by email as well.
7.3. Mike responds to the text one. Later he opens the emailed copy and is told it is no longer
     good — an invitation is spent once it is used. He learns this from the app rather than being
     left to guess.

### Alternative Path D: nobody responds

9.1. Bob sends an invitation and hears nothing.
9.2. He can see it is still outstanding, and can share it again or abandon it. It does not sit there
     looking like a conversation.

### Alternative Path E: a strand meant to grow

3.1. Bob is setting up something for his cycling group rather than for one person.
3.2. He passes on the ability to invite, to one friend he trusts, so the group does not depend on
     Bob being awake.
3.3. Everybody in it can see the same thing Bob can: this is a strand that can still grow, and
     whoever joins later will be able to read everything said before they arrived.
3.4. Each person who accepts joins the same strand. → [05](05-add-someone-to-a-strand.md)

## Acceptance Criteria

- [ ] Starting a strand never involves looking a person up; there is no directory or search
- [ ] At creation the user chooses whether the strand is private or public
- [ ] Each invitation decides whether the person taking it up can invite others
- [ ] A member can see, without asking, whether their strand is private and whether anyone in it can
      still add people
- [ ] That indication reflects the strand as it is now, and changes when the strand changes
- [ ] A member who can add people may give that ability up
- [ ] Giving it up is described as permanent, and is permanent
- [ ] When nobody holds the ability, the strand reads as settled — nobody can be added or removed,
      and every member is there on the same footing
- [ ] The user is told that anyone added later holds everything said before they arrived
- [ ] An invitation is available as both a scannable code and a shareable link
- [ ] The invitation can be shared through any channel the user already has; the app does not send it
- [ ] Outstanding invitations are visible, distinguishable from strands, and can be re-shared or abandoned
- [ ] A spent invitation says so when used again, rather than failing obscurely
- [ ] A strand does not exist until someone accepts
- [ ] A user who cannot yet be reached is told so at the moment they try to invite somebody, in
      terms of what it means rather than what is missing
- [ ] That message is not a dead end: it offers running something of their own and borrowing
      somebody else's, and does not present either as the obvious answer
- [ ] The terms already chosen survive the detour

## Variants

- happy: invitation shared in person, accepted, then closed for good
- empty: the user's first-ever strand — nothing else in the list
- error: an invitation that is never answered, or one used twice

## Open

Public strands are offered at creation but not developed this round ([sereus.md](../../specs/domain/sereus.md)). An
invitation lost before anyone takes it up leaves a strand that cannot be added to; the practical
answer is to abandon it and start another, which this story should make an easy thing to do rather
than a dead end to discover.

Step 3's choice is user-observable and stands, but the platform seats a member from a bearer
invitation and confers the ability to invite by a separate signed act. Whether "invited as someone
who can invite" can be applied without a manager being present at the moment they join is worth
checking — if not, the grant may lag the arrival, which the story would have to show.
