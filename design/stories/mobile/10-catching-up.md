# User Story: Catching up

## Story Overview

As someone who is in more strands than they can read  
I want to open the app and see what actually needs me  
So that I can deal with what matters without wading through everything else.

Context: Bob has been using the app for months and is now in fifteen or so strands. Some are alive,
most are dormant, and the cycling group talks all day about tyre pressure. He has not looked at his
phone since yesterday morning. Nearly every other story is about somebody sending something; this
one is about being on the other end of that.

## Roles

| Role | Who | Note |
|------|-----|------|
| Reader | Bob | catching up; everything here is his own bookkeeping |
| Everyone else | Susan, Mike, the cycling group | have been talking while he was away |

## Sequence

1. Bob opens the app and arrives at his strands — not at whichever conversation he happened to have
   open last. What needs him is the first thing he sees.
2. Strands with something new in them are obvious at a glance and are where he will look first.
   Strands with nothing new do not compete for his attention.
3. He can tell two different kinds of "new" apart. The cycling group has forty messages and none of
   them concern him. Susan has asked him something directly, by name. The second is not buried under
   the first.
4. He opens Susan's strand. It opens where he stopped reading — not at the top, and not scrolled
   past everything to the bottom.
5. A clear line marks where he left off, so he can see at once how much is his to catch up on.
6. What he reads is a conversation, not a list of records: messages carry the day they were sent,
   and a run of messages from one person reads as one turn rather than five separate events.
7. He reads to the end. The strand stops asking for him.
8. He goes back to his list. Susan's strand now sits quietly with the rest.
9. The cycling group accumulated its forty messages without interrupting him once, because he muted
   it ([33](33-managing-a-strand.md)). When he does open it, it behaves like any other strand.
10. One message from Mike deserves a real answer and Bob is on a train. He marks it unread again so
    it comes back to him later, rather than relying on remembering.

### Alternative Path A: back after a week

1.1. Bob has been away and there are hundreds of messages across several strands.
1.2. He can go straight to the end of any of them without pretending to have read the middle. The
     app does not make him scroll through a week to clear a badge.
1.3. Nothing shames him for the backlog, and nothing silently marks things read that he never saw.

### Alternative Path B: he read it on the other device

4.1. Bob read Susan's messages on his laptop over lunch.
4.2. By the time he picks up his phone, they are read there too. Where he has got to is his own,
     and it is the same wherever he is looking from. → [42](42-staying-connected.md)

### Alternative Path C: nothing new

1.1. Bob opens the app and there is genuinely nothing waiting.
1.2. It says so. It does not manufacture something to look at, or resurface old messages as though
     they were new.

### Alternative Path D: named in a strand he muted

3.1. Someone in the cycling group asks Bob directly about a route.
3.2. What happens depends on how he muted it, and he chose which when he did
     ([33](33-managing-a-strand.md)). He muted this one softly — quiet unless somebody names him —
     so this reaches him.
3.3. Had he muted it hard, nothing would have reached him at all, and that instruction would be
     honored rather than second-guessed.
3.4. Either way, when he next looks he can see he was addressed, distinct from the forty messages he
     was not. Muting decides whether he is *interrupted*; it never hides what happened.

## Acceptance Criteria

- [ ] Opening the app lands on the strand list, not on the last strand the user had open
- [ ] Strands with unread messages are distinguishable at a glance and are ordered to be found first
- [ ] Being addressed by name is distinguishable from a strand merely being busy
- [ ] Opening a strand returns the user to where they stopped reading
- [ ] The boundary between read and unread is marked within the strand
- [ ] Messages show the day they were sent, and consecutive messages from one sender are grouped
- [ ] The user can reach the latest message without scrolling through everything before it
- [ ] Reading to the end clears the strand's claim on the user's attention
- [ ] Nothing is marked read that the user has not seen
- [ ] The user can mark a strand unread again after reading it
- [ ] Muting stops interruption and never hides what happened
- [ ] The user chooses whether a mute still lets messages naming them through
- [ ] Nothing the reader does here is reported to anyone else; there is no delivered or read state
- [ ] How far a user has read is the same across their own devices
- [ ] With nothing new, the app says so plainly rather than inventing activity

## Variants

- happy: several strands unread, triaged, one deferred by marking it unread again
- empty: nothing new at all
- error: a strand whose new messages cannot be loaded yet

## Open

Everything here is the reader's own bookkeeping. **Nothing is reported back to the sender** — there
is no delivered or read state, and none is tracked. A reply is the evidence that a message was read;
that is the whole of it. `specs/domain/schema.md`'s `Status` column is to be removed (`STATUS.md`
§F).

Keeping read position consistent across a user's own devices is treated here as a plain expectation.
Whether that is cheap or expensive depends on where such state lives — see
[42](42-staying-connected.md).