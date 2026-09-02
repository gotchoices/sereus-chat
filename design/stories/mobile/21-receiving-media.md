# User Story: Receiving media

## Story Overview

As somebody on the receiving end of photos, files and voice messages  
I want to look at them, keep the ones I want, and find them again later  
So that what people send me is usable rather than merely delivered.

Context: The other half of [20](20-sending-media.md), which covers sending in detail and receiving in
a single line. Bob has sent Mike a video of Emma's goal; Susan has sent a document; the cycling group
posts photographs constantly.

## Roles

| Role | Who | Note |
|------|-----|------|
| Receiver | Mike | looks, keeps, passes on, clears out |
| Senders | Bob, Susan, the cycling group | their part is [20](20-sending-media.md) |

## Sequence

1. Mike sees Bob's video in the conversation. He can tell what it is before opening it — a video, how
   long, roughly how big — so he knows what he is about to spend his attention and his data on.
2. He opens it and it fills the screen, away from the conversation.
3. He can move between the pictures and videos from this strand from where he is, rather than
   dismissing and hunting for the next one in the conversation.
4. He wants to keep the goal. He saves it to his phone's own library, where it is his — outside the
   app, subject to nothing the app decides later.
5. Weeks on he wants the whole set from that season. He can see everything shared in this strand in
   one place, without scrolling back through months of talk. → [32](32-finding-something.md)
6. He sends one on to his wife, who is not in this strand, using the phone's ordinary sharing. It
   leaves the app entirely. The app cannot follow it there and does not pretend to.

### Alternative Path A: still arriving

1.1. Somebody posts a long video to the cycling group over a poor connection.
1.2. It is visibly still coming rather than broken, and the conversation carries on around it —
     nothing blocks on it.
1.3. If it cannot be finished, Mike is told rather than left with something that never resolves. He
     can ask for it again, which starts over rather than picking up where it stopped.

### Alternative Path B: something his phone cannot show

1.1. Susan sends a file of a kind Mike's phone has no idea about.
1.2. The app does not pretend to preview it. It hands it to whatever on his phone can open it, and
     if nothing can, says so plainly instead of showing a broken frame.
1.3. He can still keep it, and open it somewhere else later.

### Alternative Path C: the sender took it back

5.1. Mike goes looking for a photo and it is not there — whoever sent it removed it
     ([13](13-correcting-a-message.md)).
5.2. If he had already saved it, he has it; it is in his own library and nothing reaches it there.
5.3. If he had not, it is not recoverable from here, and he is told that plainly rather than being
     offered a retry that cannot work.

### Alternative Path D: it is filling his phone

5.1. Two years of the cycling group's photographs are taking up more room than Mike wants to give
     them.
5.2. He can see what a strand is costing him in space, which is not something he can work out for
     himself.
5.3. He can clear what he does not want to keep without leaving the strand and without it being an
     all-or-nothing choice ([33](33-managing-a-strand.md)). What other members hold is theirs and is
     unaffected.

### Alternative Path E: bigger than this phone

5.1. The cycling group's whole history is larger than Mike's phone is prepared to give it.
5.2. His phone keeps what it can and leans on the rest of the strand for the remainder. That is how
     the platform works rather than a fault, and nothing is lost by it.
5.3. What it means for Mike is **waiting**, not absence. Asking for something old fetches it, so it
     may take a moment where everything else has been instant. Nothing has gone missing.
5.4. If he is cut off, or the strand is carried only by two phones that between them do not hold it,
     the fetch cannot happen. He is told the past cannot be reached at the moment — never shown an
     empty gallery as though nothing were there.
5.5. He can trim deliberately instead of having it decided for him, and can see that adding a machine
     of his own would let him keep more. → [42](42-staying-connected.md)

### Alternative Path F: a voice message

1.1. Mike gets a voice message rather than something to look at.
1.2. He can play it, move around inside it, and carry on doing something else while it plays.
1.3. Its length is visible before he starts, so a two-second "yes" and a four-minute explanation are
     not the same proposition.

## Acceptance Criteria

- [ ] An attachment is identifiable — kind, and rough size or length — before it is opened
- [ ] Pictures and videos open full-screen, away from the conversation
- [ ] The receiver can move between a strand's pictures and videos without returning to the conversation
- [ ] The receiver can save an attachment into their own device's library, outside the app
- [ ] Everything shared in a strand can be seen in one place, without scrolling the conversation
- [ ] An attachment can be passed out of the app through the device's ordinary sharing, and the app
      makes no claim to govern it afterwards
- [ ] An attachment still arriving is distinguishable from one that has failed, and blocks nothing
- [ ] Fetching older content shows as waiting, and is never presented as an empty result
- [ ] Content that cannot be fetched is reported as unreachable, and never as deleted or absent
- [ ] A strand whose history exceeds what the user's machines can hold surfaces that as a condition
      they can act on, never as silent loss
- [ ] The user can trim deliberately, and is told that a more capable machine in their cadre would
      let them keep more
- [ ] One that cannot be completed says so, and can be asked for again
- [ ] A file the device cannot display is handed to something that can, or plainly reported as
      unopenable — never shown as broken
- [ ] An attachment the sender removed is reported as gone, with no retry offered that cannot work
- [ ] What a receiver already saved is theirs and is not reached by the sender's removal
- [ ] The receiver can see what a strand costs them in storage and clear what they do not want,
      without leaving the strand
- [ ] Voice messages show their length before playing, and can be played, moved around in, and left
      playing

## Variants

- happy: a video watched, saved, and found again later in the strand's collection
- empty: a strand nobody has shared anything in
- error: something that will not finish arriving; a file nothing can open; one the sender removed

## Open

The platform has **no strategy for large content** — no chunking, no resumability, no
content-addressed dedup. Attachments are ordinary rows replicated as ordinary blocks (`STATUS.md`
§G). Alt A's "ask for it again, which starts over" is written for that limitation rather than
around it; if resumability arrives, that path gets kinder. Long videos may simply not be practical
until it does.

Alt D assumes a member can drop media they are holding without weakening the strand for everybody
else. Since members are also replicas, that may not be true — whether an app can free space without
degrading what the strand can still serve is a platform question worth asking before this is built.
It is the same question Alt E raises from the other side: a phone that keeps less is a phone the
strand can lean on less. Partial locality is recorded in `specs/domain/overview.md`.

Any limit on the size of an attachment is the **user's setting**, not a rule handed down
([20](20-sending-media.md)).
