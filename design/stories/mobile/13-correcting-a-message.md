# User Story: Correcting a message

## Story Overview

As a Sereus Chat user  
I want to Edit or delete messages I've already sent  
So that I can correct mistakes, remove inappropriate content, or update information that has changed.

Context: Bob just sent Susan a message saying "Meeting at 2pm tomorrow" but immediately realizes he got the time wrong - it's actually at 3pm.
Mike sent Bob a photo attachment but then noticed it contained sensitive information in the background that shouldn't be shared.
Susan typed a long message to Bob but autocorrect changed several words making it confusing.

## Roles

| Role | Who | Note |
|------|-----|------|
| Author | Bob | sent the message being corrected |
| Reader | Susan | may already have seen it |

## Sequence
1. Bob sends the message "Meeting at 2pm tomorrow" to Susan.
2. He immediately realizes the time is wrong.
3. He selects the message he just sent.
4. He chooses to edit the message.
5. He changes "2pm" to "3pm".
6. He saves the edit.
7. Susan sees the updated message showing "Meeting at 3pm tomorrow".
8. The message shows an indicator that it was edited.

### Alternative Path A: Correcting later

2. Bob does not notice the mistake until ten minutes later.
3. He edits the message the same way. There is no window that closes — a member may correct or
   remove their own content at any time.
4. Susan sees the corrected time, marked as edited.

### Alternative Path B: Removing an attachment

1. Mike sends Bob a photo and immediately notices sensitive information in the background.
2. He removes the photo from the message, keeping the text.
3. The photo goes from the strand. Every member's app stops showing it.
4. Mike is told plainly what that does and does not achieve: it is gone from the conversation, but
   anyone who already saw it could have saved or passed it on, and nothing can reach those copies.
   He is told this without being made to feel the app has failed him — it is simply the truth about
   any photo shown to anybody.

### Alternative Path C: Deleting a message

1. Bob sends a message to Susan and realises it was meant for Mike.
2. He deletes it.
3. It goes from the conversation. The app does not put a marker in its place — no "message deleted"
   placeholder manufactured for the sake of it. If the underlying record happens to leave a trace,
   that is no bad thing and nothing here works to hide it.

### Alternative Path D: Text and attachment together

1. Susan sent a message with a document attached, and both the text and the document were wrong.
2. She corrects the text, removes the document, and attaches the right one.
3. Bob sees the corrected message, marked as edited.

### Alternative Path E: Somebody else's message

1. Bob would like to remove something Susan said.
2. He cannot. A member may edit and delete their own content and nobody else's — there is no
   moderation, and being a manager does not confer it.

## Acceptance Criteria

- [ ] A member can edit the text of a message they sent
- [ ] A member can add or remove attachments on a message they sent
- [ ] An edited message is marked as edited
- [ ] An edit replaces what was there; earlier versions are not kept or shown
- [ ] A member can delete their own message, and the app puts no marker in its place
- [ ] Nothing is built to erase evidence that something was there; the app simply does not
      manufacture a placeholder
- [ ] There is no time limit on correcting or deleting one's own content
- [ ] A member cannot edit or delete anyone else's content
- [ ] Removing content is described as removing it from the conversation, never as making it
      unrecoverable
- [ ] When an attachment is removed, the user is told that copies already seen cannot be reached

## Variants

- happy: a typo corrected, and the correction is what everyone sees
- empty: nothing sent yet, so nothing to correct
- error: an attempt to change content that is not the user's own

## Open

Removal propagates to every member, but has no reach over copies cached or backed up elsewhere
([sereus.md](../../specs/domain/sereus.md)). Nothing in this story may imply otherwise.
