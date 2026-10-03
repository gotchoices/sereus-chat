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
3. He creates an invitation for the person he has in mind. He is shown, in one line, what it is: for
   one person, good for a week, and the person who takes it up cannot invite others. Those are the
   defaults for a private strand, and he can leave them alone.
4. This is his brother, so the defaults are right. Had he wanted otherwise, a "Change" link beside
   that line lets him say who can use it (one person, or anyone with the link), how long it stays
   good, and whether the person taking it up can invite others, as he can.
5. He can see what the strand is, plainly and without asking: private, and open to growing, because
   Bob himself can still add people. The app does not treat this as a problem — it is simply what is
   true right now, and he can see it at a glance.
6. He gets the invitation as a QR code on screen, and as a link for when the person is not in front
   of him.
7. He can share the link however he would normally reach that person — message, email, print. The
   app does not send it for him, because it has no way to reach anyone.
8. Susan is right there, so he holds up his phone and says "scan this".
9. He can see the invitation is outstanding, as part of the strand it leads into. The strand already
   exists — an invitation is a way into a particular strand, so it has to be there first — but
   nobody else is in it until someone accepts, and it says so rather than looking like a conversation
   already under way.
   → [03](03-respond-to-an-invitation.md)

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
     good: an invitation for one person is spent once it is used. He learns this from the app rather
     than being left to guess. Had someone else found the lost copy first, it would have been spent
     for them too; that is why a private strand's invitations are for one person by default.

### Alternative Path D: nobody responds

9.1. Bob sends an invitation and hears nothing.
9.2. He can see it is still outstanding, within the strand it leads into, and can share it again or
     abandon it. It does not sit there looking like a conversation, or like a second strand.

### Alternative Path E: a strand meant to grow

3.1. Bob is setting up something for his cycling group rather than for one person.
3.2. He passes on the ability to invite, to one friend he trusts, so the group does not depend on
     Bob being awake.
3.3. Everybody in it can see the same thing Bob can: this is a strand that can still grow, and
     whoever joins later will be able to read everything said before they arrived.
3.4. Each person who accepts joins the same strand. → [05](05-add-someone-to-a-strand.md)

### Alternative Path F: a link anyone can use

3.1. Bob runs an open strand for anyone interested in local rides, and wants a link he can post on
     the club's website.
3.2. For an open strand the defaults are already that: anyone with the link can use it, as many
     times as people take it up, good for a month. He can make it last longer or shorter under
     "Change".
3.3. The outstanding invitation shows how many people have used it and when it runs out. It stays
     listed until then; there is no recalling it, so if it goes somewhere he did not mean it to, he
     can start a fresh strand.
3.4. If he also lets the people taking it up invite others, he is told plainly what that means for a
     link anyone can use: everyone who finds it can bring in anyone they like. He may still do it.

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
- [ ] Outstanding invitations are visible as part of the strand they lead into, distinguishable from
      its members, and can be re-shared or abandoned
- [ ] A spent invitation says so when used again, rather than failing obscurely
- [ ] Each invitation decides who can use it (one person, or anyone with the link) and how long it
      stays good
- [ ] Defaults follow the kind of strand: a private strand's invitations are for one person and
      good for a week; an open strand's are for anyone with the link and good for a month
- [ ] The defaults are shown as one line, and changing them is one step away, so a newcomer never
      has to decide anything to share an invitation
- [ ] A link anyone can use that also lets them invite others is allowed, with a plain warning of
      what it means
- [ ] An invitation anyone can use shows how many have used it, and stays listed until it runs out
- [ ] A new strand exists from the moment its first invitation is made, and reads as having nobody
      else in it until someone accepts
- [ ] Further invitations made for it lead into that same strand, never into a new one
- [ ] A user who cannot yet be reached is told so at the moment they try to invite somebody, in
      terms of what it means rather than what is missing
- [ ] That message is not a dead end: it offers running something of their own and borrowing
      somebody else's, and does not present either as the obvious answer
- [ ] The terms already chosen survive the detour

## Variants

- happy: invitation shared in person, accepted, then closed for good
- empty: the user's first-ever strand — nothing else in the list
- error: an invitation that is never answered, or one meant for one person used twice

## Open

Public strands are offered at creation but not developed this round ([sereus.md](../../specs/domain/sereus.md)). An
invitation lost before anyone takes it up is not a dead end: the strand is still there, and Bob makes
another invitation into it. A strand nobody ever joins stays in his list until he leaves it.

Why the strand comes first: in sereus an invitation names the strand it lets somebody into, so the
strand must exist before the invitation can. An earlier version of this story had the strand come
into being at acceptance; the platform does not work that way.

Abandoning an invitation (path D) means withdrawing it, so that it no longer works. The control
schema supports that (an owner-signed delete of the invitation's record), but cadre-core offers no
call for it yet. Until it does, the app can stop listing an invitation, but cannot make it stop
working before it expires, and has to say so.

Step 3's choice is user-observable and stands, but the platform seats a member from a bearer
invitation and confers the ability to invite by a separate signed act. Whether "invited as someone
who can invite" can be applied without a manager being present at the moment they join is worth
checking — if not, the grant may lag the arrival, which the story would have to show.
