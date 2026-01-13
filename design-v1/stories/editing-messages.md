# User Story: [Editing Messages]

## Story Overview

**As a** Sereus Chat user,
**I want to** Edit or delete messages I've already sent,
**So that** I can correct mistakes, remove inappropriate content, or update information that has changed.

**Context:**
Bob just sent Susan a message saying "Meeting at 2pm tomorrow" but immediately realizes he got the time wrong - it's actually at 3pm.
Mike sent Bob a photo attachment but then noticed it contained sensitive information in the background that shouldn't be shared.
Susan typed a long message to Bob but autocorrect changed several words making it confusing.

## Primary Sequence Path
1. Bob sends the message "Meeting at 2pm tomorrow" to Susan.
2. He immediately realizes the time is wrong.
3. He selects the message he just sent.
4. He chooses to edit the message.
5. He changes "2pm" to "3pm".
6. He saves the edit.
7. Susan sees the updated message showing "Meeting at 3pm tomorrow".
8. The message shows an indicator that it was edited.

**Alternative Path A: [Editing After Delay]**
2. Bob doesn't realize the error until 10 minutes later.
3. Susan has already seen the original message.
4. Bob edits the message to correct the time.
5. Susan receives a notification that Bob edited his message.
6. She sees the updated time and the edit indicator.

**Alternative Path B: [Removing Attachment]**
1. Mike sends Bob a photo.
2. He immediately notices sensitive information in the background.
3. He selects the message with the photo.
4. He edits the message.
5. He removes the photo attachment but keeps the text.
6. He saves the edit.
7. Bob sees the message now without the photo.
7.1. Bob had already viewed the photo before Mike removed it.
7.2. The app indicates to Mike that the message was seen before editing.

**Alternative Path C: [Deleting Message Completely]**
1. Bob sends a message to Susan.
2. He immediately realizes it was meant for Mike, not Susan.
3. He selects the message.
4. He chooses to delete the message.
5. He confirms the deletion.
6. The message is removed from the conversation.
7. Susan sees an indicator: "Bob deleted a message" (or the message disappears entirely, depending on system design).

**Alternative Path D: [Editing Text and Attachments]**
1. Susan sends Bob a message with text and a document attached.
2. She realizes both the text has typos and she attached the wrong version of the document.
3. She edits the message.
4. She corrects the text typos.
5. She removes the old document.
6. She attaches the correct document.
7. She saves all edits.
8. Bob sees the fully updated message with edit indicator.

**Alternative Path E: [Edit Not Allowed]**
1. Bob tries to edit a message he sent 3 days ago.
2. The system informs him that messages can only be edited within 24 hours of sending.
3. He instead sends a new message: "Correction to my message from Wednesday: ..."

**Alternative Path F: [Viewing Edit History]**
7. Susan sees that Bob edited his message.
8. She's curious what changed.
9. She views the message edit history.
10. She sees both the original ("2pm") and edited version ("3pm").

## Acceptance Criteria

- [ ] Users can edit messages they have sent (text content).
- [ ] Users can add or remove attachments from sent messages.
- [ ] Edited messages display an indicator showing they were edited.
- [ ] Recipients are notified when a message they've seen is edited.
- [ ] Users can delete messages they have sent.
- [ ] The system indicates whether recipients had seen the message before edit/deletion.
- [ ] Edit history can be viewed showing original and edited versions.
- [ ] There may be time limits on editing (to be determined by specs).

