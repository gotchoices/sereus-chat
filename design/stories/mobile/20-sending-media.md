# User Story: Sending media

## Story Overview

As somebody in a strand
I want to send a picture, a video, a recording or a file
So that I can show a thing rather than describe it.

Context: Bob is at his daughter's game and has fifteen seconds of video worth more than any sentence
he could write. Later Susan has a document Bob is waiting on, and Mike wants to say something out
loud from a noisy airport rather than type it. The receiving half of all this is
[21](21-receiving-media.md).

## Roles

| Role | Who | Note |
|------|-----|------|
| Sender | Bob, Susan, Mike | chooses the thing and sends it |
| Strand | whoever else is in it | everyone in the strand gets it; there is no sending to one member |

## Sequence

1. Bob is in the strand with Mike and wants to attach the video he just took.
2. He is offered the ways of getting one: something already on his phone, or taking it now with the
   camera or the microphone. Which of those his phone will allow is its business, not the app's, and
   the app asks for permission only at the moment he chooses one that needs it.
3. He picks the video, and can say something alongside it. The words and the thing are one message,
   not two. → [11](11-writing-a-message.md)
4. He sends it. It appears in the conversation as his, immediately, because it is his — it is on his
   phone already.
5. What happens next is Mike's side of it, and it is not instant: the thing has to travel, and until
   it does Mike has a message that says a video is coming. → [21](21-receiving-media.md)

### Alternative Path A: more than one thing

3.1. Susan has three documents that only make sense together. She attaches all three to one message
     rather than sending three messages.
3.2. They arrive as one message with three things in it. → 4

### Alternative Path B: speaking instead of typing

2.1. Mike holds to record and speaks. He hears it back before deciding.
2.2. He can discard it and start again, or send it. A recording he discards is never sent and never
     seen. → 4

### Alternative Path C: bigger than he wants to send

3.3. The video is far larger than the size Bob has said he is willing to send. He is told so before
     it goes anywhere, with the size and his own limit both stated.
3.4. **This is his own setting, not a rule handed to him.** There is nobody to set a platform limit
     and no reason for one: what is reasonable depends on whose machines are carrying it. He set it
     in [41](41-settings.md) and can change it there, or let this one through.
3.5. If he would rather send less, he can shorten the video or pick something else. → 3

### Alternative Path D: the phone says no

2.2. Bob's phone refuses the camera, or the library, because he has not granted it.
2.3. He is told plainly what was refused and that it is his phone's decision, with the way to change
     it if he wants to. Nothing is half-attached and the message he was writing is not lost. → 2

### Alternative Path E: he changes his mind

3.6. Bob attaches the wrong clip and notices before sending. He removes it from the message he is
     still writing; nothing has been sent, so nothing has to be undone.
3.7. Once it is sent, taking it back is a different act with different consequences.
     → [13](13-correcting-a-message.md)

## Acceptance Criteria

- [ ] A picture, video, recording or file can be attached from the device, or captured on the spot
- [ ] Several things can go in one message
- [ ] Words and attachments are one message, sent together
- [ ] Permission is asked for only when the user chooses something that needs it, and a refusal is
      reported as the phone's decision, not a failure of the app
- [ ] An attachment can be removed while the message is still being written, with no trace
- [ ] Any size limit is presented as **the user's own setting**, states the size and the limit, and
      can be overridden or changed — no platform limit is asserted
- [ ] A recording can be heard back and discarded before sending
- [ ] A sent attachment appears immediately for the sender, whose device already holds it
- [ ] The sender is never shown delivery or read state — there is none

## Variants

- happy: a photo sent with a caption
- empty: a strand with nothing shared in it yet
- error: the file exceeds the user's own limit; camera or library permission refused

## Open

Nothing outstanding.
