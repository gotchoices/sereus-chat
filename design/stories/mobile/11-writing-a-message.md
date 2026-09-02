# User Story: Writing a message

## Story Overview

As someone composing something longer than "ok"  
I want to write it without losing it, and to know whether it went  
So that the app never quietly eats what I typed, and never tells me something left when it did not.

Context: Bob is answering Susan's question from [10](10-catching-up.md). It needs a couple of
paragraphs and a link, and he is on a train.

## Roles

| Role | Who | Note |
|------|-----|------|
| Writer | Bob | everything here is his own, until he sends it |

## Sequence

1. Bob starts writing. The composer grows with what he writes — a few lines of thought are not
   squeezed through a one-line slot — and it stops growing before it swallows the conversation he is
   replying to.
2. His phone rings and he leaves the app. He comes back a few minutes later to the same strand and
   what he had written is exactly where he left it, cursor and all. He did not have to send it early
   to keep it.
3. He pastes a link. It stays as he pasted it — nothing goes off to fetch the page.
4. He finishes and sends.
5. He can see the message has left his phone. That is the whole of what he is told, because it is
   the whole of what the app knows ([04](04-our-first-conversation.md)).
6. Susan later wants a line of it in a document, and can select and copy the text out. Messages are
   text, not something locked behind a bubble.

### Alternative Path A: sending with nothing reachable

4.1. The train goes into a tunnel as Bob taps send.
4.2. Nothing remarkable happens. His phone holds the conversation itself, so the message is written
     there and then and takes its place in the conversation like any other. He is not shown a
     pending state, an outbox, or a spinner, because there is nothing waiting on anybody.
4.3. It reaches Susan when their machines can next reach each other. Bob does not have to be
     watching, in the app, or even awake for that.
     → [04](04-our-first-conversation.md)

### Alternative Path A2: a message that could not be written at all

4.1. Something is genuinely wrong — storage, or the strand itself — and the message cannot be
     recorded.
4.2. Bob is told, and what he wrote is still in front of him rather than lost with the failure.
4.3. He can try again or set it aside. This is the rare case; being unreachable is not it.

### Alternative Path B: half-written in three places

2.1. Bob has unfinished messages in three different strands — a reply to Susan, something for the
     cycling group, a note to his brother.
2.2. Each strand keeps its own, unmixed.
2.3. He can tell from his list where he has left something unfinished, so a draft is not lost merely
     by being out of sight. → [30](30-my-strands.md)
2.4. Nothing he has not sent leaves his phone. A draft is his own until the moment he decides
     otherwise, and half-written thoughts are never part of the conversation.

### Alternative Path C: changing his mind before sending

2.1. Bob rereads what he wrote and decides against all of it.
2.2. He clears it, and nothing lingers — no ghost draft, no half-message that resurfaces next week.

## Acceptance Criteria

- [ ] The composer grows with the text and stops before it hides the conversation
- [ ] An unsent draft survives leaving the strand and leaving the app, per strand, without being sent
- [ ] The user can see from the strand list where they have left an unfinished message
- [ ] Clearing a draft leaves nothing behind
- [ ] An unsent draft never leaves the device
- [ ] Pasted links are not fetched, previewed or expanded by either end
- [ ] Message text can be selected and copied out
- [ ] A sent message takes its place in the conversation immediately, whether or not anything else is
      reachable
- [ ] No pending, sending or outbox state is shown for the ordinary case of being unreachable
- [ ] A message that genuinely could not be recorded says so, keeps what the user wrote, and can be
      retried or set aside
- [ ] Nothing is silently dropped

## Variants

- happy: a long reply written, interrupted, resumed and sent
- empty: an empty composer, with nothing to send
- error: a message that cannot be recorded at all — not merely one sent while unreachable

## Open

**Link previews are simply not built**, which is the cheaper thing to build and avoids telling a
third party that a conversation exists. If they are ever wanted, the setting belongs to the
**viewer**, not the sender: the fetch that leaks most is the recipient's, because it reveals roughly
when a message was read and by someone. A sender-side toggle would not protect the person who
matters.

Sending while unreachable is written as a non-event because the phone holds the strand itself. That
is the platform's intent and is partly there — Optimystic short-circuits cluster consensus for a
solo node, and `strand-backfill.ts` pushes blocks written while alone once a peer appears — but not
yet dependable: `CadreNode` hardcodes a cluster size that makes the solo escape hatch unreachable
([gotchoices/sereus#2](https://github.com/gotchoices/sereus/issues/2)), and a block written while
alone can still be unreadable by others (`tickets/blocked/block-held-by-only-one-machine-is-unreadable.md`).
If that does not resolve, Alt A2 becomes the common case rather than the rare one.
