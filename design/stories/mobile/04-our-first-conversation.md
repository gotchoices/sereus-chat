# User Story: Our first conversation

## Story Overview

As two people who have just formed a strand  
I want to send and receive our first messages  
So that the thing we just set up turns out to be a conversation, and behaves the way I expect one to.

Context: Continues from [03](03-respond-to-an-invitation.md). Susan has just accepted Bob's
invitation; Mike has accepted his in the car.

## Roles

| Role | Who | Note |
|------|-----|------|
| Members | Bob and Susan; Bob and Mike | two separate strands, each with two people |

## Sequence

1. Susan lands in something that looks like every other messaging app she uses. It is not novel and
   does not try to be.
2. She can see who she is talking to, a place to type, and a way to attach things.
3. She types "Hi!" and sends it.
4. She can tell her message has gone out, and later that it has arrived. The two are different, and
   the app does not claim the second when it only knows the first.
5. Bob's phone gets her message and he finally puts his arm down.
6. He replies. Susan sees it arrive without doing anything to fetch it.
7. Both of them now have a strand in an app that was empty an hour ago, and it is obvious how to
   get back to it. → [30](30-my-strands.md)

### Alternative Path A: a message that has not gone anywhere yet

3.1. Susan sends hers while riding the lift, with no signal.
3.2. The message is visibly not sent yet, rather than silently pending or falsely delivered.
3.3. When she has signal again it goes. She did not have to do anything, and could have retried or
     abandoned it if she wanted to. → [11](11-writing-a-message.md)

### Alternative Path B: the other person is not there

4.1. Mike accepted Bob's invitation from the car and then drove into a tunnel.
4.2. Bob's messages sit undelivered. The app does not pretend otherwise, and does not lose them.
4.3. When Mike surfaces, they arrive.

### Alternative Path C: a voice message instead

3.1. Mike is driving and is not going to type. He records a short voice message instead: "Hey, you
     found this app too. Pretty cool."
3.2. He sends it, and Bob plays it back. → [20](20-sending-media.md)

## Acceptance Criteria

- [ ] A newly formed strand opens into a conversation that is immediately familiar
- [ ] The user can see who they are talking to, type a message, and send it
- [ ] Sent and arrived are distinguishable, and the app never claims arrival it cannot know
- [ ] Incoming messages appear without the user fetching them
- [ ] A message that has not gone out is visibly unsent, and can be retried or abandoned
- [ ] Messages to someone unreachable are neither lost nor falsely reported as delivered
- [ ] Returning to the strand later is obvious

## Variants

- happy: a message sent and answered
- empty: a strand with no messages in it yet
- error: no connectivity when sending; the other member unreachable

## Open

What "arrived" can honestly mean, and where an undelivered message rests in the meantime, depend on
sereus delivery behavior — `STATUS.md` §H. This story states only what the user should be able to
tell, not the mechanism.
