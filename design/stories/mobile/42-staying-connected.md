# User Story: Staying connected

## Story Overview

As somebody with only a phone  
I want to be reachable at all, and then to stay reachable while I sleep  
So that people I invite can actually answer, and so my conversations keep working when I am not holding it.

Context: Bob has just tried to invite Susan and been told there is nowhere for her to answer
([02](02-start-a-strand.md)). Deliberately brief — the machines a person owns are **sereus's** to
design, and the screen is a shared component, not chat's. This story records only what a chat user
notices and why they would act.

## Roles

| Role | Who | Note |
|------|-----|------|
| The user | Bob | one phone, considering a second machine |

## Sequence

1. Bob cannot invite anybody. A phone on its own has no address the world can reach, so there is
   nowhere for an answer to arrive. This is where almost everybody starts.
2. He is offered two honest ways out, neither dressed up as the obvious one.
3. **Something of his own that stays awake.** His machine, nobody else in it. More to set up, and
   the answer he will want in the end.
4. **Borrowing somebody else's for now.** Quicker, and the app is straight about the cost before he
   takes it: whoever runs it will be able to see that he talks to people, when, and how much — never
   what he says. He is choosing a particular person to know that much about him.
5. He takes the quick route. He is shown where such offers are listed rather than the app choosing
   for him, picks one, and confirms it knowing what it means.
6. He is reachable. His invitation works, Susan answers, and nothing about the conversation itself
   involves the machine he borrowed. → [02](02-start-a-strand.md)
7. Months later he notices the other things a sleeping phone costs him: messages sit until he opens
   the app, reaching into the past makes him wait ([21](21-receiving-media.md)), and nothing wakes
   him however he sets his notifications ([41](41-settings.md)).
8. So he adds a machine of his own. Those three things change, and he stops depending on anybody
   else's goodwill to be reachable at all.
9. He can remove a machine later, and is told what he would be giving back.

### Alternative Path A: the borrowed one goes away

6.1. The machine Bob was borrowing stops answering, or stops taking new arrangements.
6.2. He finds out because he is told, not because an invitation quietly fails.
6.3. He is offered the same two ways out as before. Nothing he has said is lost; his strands are
     unaffected. What he loses is the ability to be *reached* by somebody new.

### Alternative Path B: he wants nothing borrowed

4.1. Bob does not want a stranger knowing even the shape of his conversations.
4.2. That is a reasonable position and the app does not argue. He sets up something of his own
     first, and does not get to invite anybody until he has.

### Alternative Path C: only ever a phone

1.1. Bob does neither, and the app does not block him or nag.
1.2. He can read and write in strands he is already in. He cannot bring anybody new in, and he is
     told that plainly once rather than reminded.

### Alternative Path D: something that has gone quiet

8.1. One of Bob's machines stops answering.
8.2. What he can see is that it was last heard from some time ago. Whether it is unplugged, out of
     signal, or gone for good is not something anything here can know, and the app does not guess on
     his behalf ([31](31-whos-in-this-strand.md) takes the same line about people).

### Alternative Path E: it is not only about chat

2.1. Bob has another sereus app on the same phone.
2.2. His machines are **his**, not this app's. What he adds here serves everything he runs on
     sereus, and the same page turns up in those apps saying the same things.

## Acceptance Criteria

- [ ] A user who cannot be reached is told so, in terms of what it prevents rather than what is
      missing, and is never left at a dead end
- [ ] Both ways out are offered plainly, and neither is presented as the obvious choice
- [ ] Before borrowing somebody else's machine, the user is told what its operator would be able to
      see — that they talk, when, and how much — and that it is never what they say
- [ ] The app does not choose an operator for the user; it shows where offers are listed and the
      user picks
- [ ] Borrowing is described as borrowing: it can end, and the user is told when it has
- [ ] Losing a borrowed machine costs reachability only — no strand and nothing said is affected
- [ ] A user who declines to borrow anything is not nagged, and can still use strands they are in
- [ ] A user can add a machine of their own, and see what changes when they do
- [ ] A user can remove one, and is told the consequence
- [ ] Each machine shows when it was last heard from, without the app claiming to know why it is
      quiet
- [ ] It is clear that these machines are the user's own and serve every sereus app they run

## Variants

- happy: unreachable, borrows a relay, invites successfully; later adds a machine of their own
- empty: a user with only a phone and nothing borrowed
- error: the borrowed machine goes away; a machine of their own stops answering

## Open

**Where offers are listed.** The app deliberately ships with no operators in it: a bundled list ages
badly, cannot be retracted, and makes the app carry infrastructure policy it should not have. The
list lives on the web (`chat/web/`, published to sereus.org/chat) where it can be changed and
withdrawn, and a link carries a chosen operator back into the app. Two consequences worth holding
on to: listing somebody reads as vouching for them, whatever a disclaimer says; and a link that
configures reachability must **propose**, never apply silently — any page can offer one, and the
cost is invisible afterwards.

**This screen is not chat's to design.** Chat renders a shared component (`apps/mobile/src/cadre-ui/`,
with its own `SPEC.md`), developed here first and intended to be proposed upstream as
`@sereus/cadre-rn-ui`; the API beneath it comes from sereus and should be common to chat, health,
bonum and anything else. The furthest-along sibling is health's **Sereus Connections**
(`health/design/specs/mobile/screens/sereus-connections.md`), which is worth reading before this is
built. Chat's version deliberately excludes strand membership, because chat has its own invitation
flow ([02](02-start-a-strand.md), [05](05-add-someone-to-a-strand.md)); health puts guests on the
same page instead.

Known rough edges already recorded in those specs, and the reason this story stays vague: adding a
machine is currently a seed handed to it out of band rather than anything automatic; removal is not
fully supported beneath the UI; machine status renders as unknown until live probing is wired; and a
solo node cannot reliably read its own control database, so the screen must time-box those reads or
it hangs forever on first visit.
