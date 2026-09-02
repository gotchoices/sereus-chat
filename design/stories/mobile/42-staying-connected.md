# User Story: Staying connected

## Story Overview

As somebody whose phone is asleep most of the day  
I want something of mine that stays awake  
So that my conversations keep working, keep up with me, and can reach me.

Context: Bob has been using the app for months on one phone. Deliberately brief — the machines a
person owns are **sereus's** to design, and the screen is a shared component, not chat's. This story
records only what a chat user notices and why they would act.

## Roles

| Role | Who | Note |
|------|-----|------|
| The user | Bob | one phone, considering a second machine |

## Sequence

1. Bob keeps noticing the same three things. Messages sit until he opens the app. Scrolling back far
   enough makes him wait ([21](21-receiving-media.md)). And nothing reaches him while the phone is
   asleep, however he sets his notifications ([41](41-settings.md)).
2. He finds the page about his own machines. It shows who he is on the network and what is currently
   acting for him: this phone, and nothing else.
3. He is told what that costs him, in his own terms rather than in the language of nodes. One phone
   means his conversations only move when he is holding it, only as much history is to hand as the
   phone will keep, and nothing can wake him.
4. He adds something of his own that stays on. The app gives him what that machine needs; he sets it
   up over there, and it appears here as his.
5. Afterwards the three things are different. Messages move while he sleeps, more of the past is to
   hand without waiting on anybody, and something is awake to be reached.
6. He can remove a machine later, and is told what he would be giving back if it leaves him with
   only the phone again.

### Alternative Path A: only ever a phone

1.1. Bob never adds anything, and the app does not block him or nag.
1.2. The consequence is stated once, accurately, in his terms — not as a defect and not as a feature
     he is failing to buy.

### Alternative Path B: something that has gone quiet

5.1. One of Bob's machines stops answering.
5.2. What he can see is that it was last heard from some time ago. Whether it is unplugged, out of
     signal, or gone for good is not something anything here can know, and the app does not guess on
     his behalf ([31](31-whos-in-this-strand.md) takes the same line about people).

### Alternative Path C: it is not only about chat

2.1. Bob has another sereus app on the same phone.
2.2. His machines are **his**, not this app's. What he adds here serves everything he runs on
     sereus, and the same page turns up in those apps saying the same things.

## Acceptance Criteria

- [ ] A user can reach a page showing their network identity and the machines acting for them, with
      this device among them
- [ ] The cost of having only a phone is stated once, in terms of what the user experiences —
      messages waiting, history that has to be fetched, nothing able to wake them — and not as an
      error
- [ ] A user can add a machine of their own, and see it become part of what acts for them
- [ ] A user can remove one, and is told the consequence when it would leave them with only a phone
- [ ] Each machine shows when it was last heard from, without the app claiming to know why it is
      quiet
- [ ] The user is not nagged for running only a phone
- [ ] It is clear that these machines are the user's own and serve every sereus app they run, not
      this one

## Variants

- happy: a second machine added, and the difference visible afterwards
- empty: a user with only a phone
- error: a machine that has stopped answering

## Open

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
