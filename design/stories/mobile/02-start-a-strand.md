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

1. Bob starts a strand. He is not asked to look anybody up — there is no directory — only to
   decide what kind of strand this is and then get the invitation to a person himself.
   <!--EC The act of deciding whether it is "just two" probably happens upon inviting someone to the strand, not necessarily upon creation.  If, in the UX, this is a single action, then fine.  Else we should tweak.
   
   Under the hood, we need to mark a strand as public or private.  And when we invite people, we need to either make them managers or not.  How does that translate to the UX? -->
2. He is asked whether this strand is just the two of them, permanently, or whether it can grow
   later. He is told what the choice means in the only terms that matter: who will ever be able to
   read what is said in it. He is also told it is settled now, because anyone added later holds the
   whole history.
3. He picks just the two of them, since this is his brother.
4. He gets an invitation he can hand over: a QR code on screen, and a link for when the other
   person is not in front of him.
5. He can share the link however he would normally reach the person — message, email, print,
   anything. The app does not send it for him, because it has no way to reach anyone.
6. Susan is right there, so he simply holds up his phone and says "scan this".
7. He can see the invitation is outstanding, and that nothing exists yet — there is no strand until
   someone accepts. → [03](03-respond-to-an-invitation.md)

### Alternative Path A: someone who is not in the room

6.1. Bob wants to invite his brother Mike, who is across town. He sends the link by text.
6.2. He gets impatient and sends the same link by email as well.
6.3. Mike responds to the text one. Later he opens the emailed copy and is told it is no longer
     good — an invitation is spent once it is used. He learns this from the app rather than being
     left to guess.

### Alternative Path B: nobody responds

7.1. Bob sends an invitation and hears nothing.
7.2. He can see it is still outstanding, and can share it again or abandon it. It does not sit there
     looking like a conversation.

### Alternative Path C: a strand that can grow

2.1. Bob is setting up something for his cycling group rather than one person.
2.2. He chooses a strand that can grow, and is told plainly that whoever joins later can read
     everything said before they arrived.
2.3. He shares the invitation the same way. Each person who accepts joins the same strand.
     → [05](05-add-someone-to-a-strand.md)

## Acceptance Criteria

- [ ] Starting a strand never involves looking a person up; there is no directory or search
- [ ] The user chooses at creation whether the strand is permanently two-party or can grow
- [ ] That choice is explained in terms of who will ever be able to read the strand
- [ ] The user is told the choice is permanent, and why: later members hold the whole history
- [ ] An invitation is available as both a scannable code and a shareable link
- [ ] The invitation can be shared through any channel the user already has; the app does not send it
- [ ] Outstanding invitations are visible, distinguishable from strands, and can be re-shared or abandoned
- [ ] A spent invitation says so when used again, rather than failing obscurely
- [ ] A strand does not exist until someone accepts

## Variants

- happy: invitation shared in person, accepted shortly after
- empty: the user's first-ever strand — nothing else in the list
- error: an invitation that is never answered, or one used twice

## Open

Invitation expiry, revocation and single-use semantics are sereus's (`STATUS.md` Appendix). This
story states only what the user sees. Whether a permanently-two-party strand is visibly declared at
formation, or is merely the result of nobody holding invite rights, is the open question in
`STATUS.md` §G — step 2 assumes the former.
