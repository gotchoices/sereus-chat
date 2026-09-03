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
4. Her message is in the conversation. That is the extent of what the app tells her, and it does not
   invent more — nothing reports back what happened at Bob's end.
5. Bob's phone gets her message and he finally puts his arm down.
6. He replies. Susan sees it arrive without doing anything to fetch it.
7. Both of them now have a strand in an app that was empty an hour ago, and it is obvious how to
   get back to it. → [30](30-my-strands.md)

### Alternative Path A: sending with nothing reachable

3.1. Susan sends hers while riding the lift, with no signal.
3.2. It takes its place in the conversation anyway — her phone holds the conversation, so there is
     nothing to wait for and no outbox to sit in.
3.3. It reaches Bob when their machines can next reach each other, without her doing anything.
     → [11](11-writing-a-message.md)

### Alternative Path B: the other person is not there

4.1. Mike accepted Bob's invitation from the car and then drove into a tunnel.
4.2. Bob's messages are in the conversation. Whether Mike has them yet is not something Bob is
     shown, because it is not tracked, and the app does not guess on his behalf.
4.3. When Mike surfaces they reach him, and he answers. The answer is how Bob knows.

### Alternative Path C: a voice message instead

3.1. Mike is driving and is not going to type. He records a short voice message instead: "Hey, you
     found this app too. Pretty cool."
3.2. He sends it, and Bob plays it back. → [20](20-sending-media.md)

## Acceptance Criteria

- [ ] A newly formed strand opens into a conversation that is immediately familiar
- [ ] The user can see who they are talking to, type a message, and send it
- [ ] A sent message takes its place in the conversation immediately, whether or not anything else
      is reachable
- [ ] Nothing is claimed about a message's fate beyond that: there is no delivered or read state,
      and a reply is the only evidence a message was read
- [ ] Incoming messages appear without the user fetching them
- [ ] A message that has not gone out is visibly unsent, and can be retried or abandoned
- [ ] Messages to someone unreachable are not lost, and are not reported as delivered
- [ ] Returning to the strand later is obvious

## Variants

- happy: a message sent and answered
- empty: a strand with no messages in it yet
- error: no connectivity when sending; the other member unreachable

## Open

Where a message rests while its recipient is unreachable depends on sereus delivery behavior
([sereus.md](../../specs/domain/sereus.md)). This story states only what the user can tell — that it left their device — and
deliberately claims nothing further.

**There is no authority on message timing.** Each party logs its own content to the strand; nothing
is watching, and no clock is trusted. Stories deliberately do not go into ordering — see
`specs/domain/schema.md` for the placeholder and the two routes open to us.
