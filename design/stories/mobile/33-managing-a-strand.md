# User Story: Managing a strand

## Story Overview

As a Sereus Chat user  
I want to Remove or archive strands I no longer need  
So that my strand list stays organized and focused on active relationships.

Context: Bob connected with someone at a conference 6 months ago to exchange contact info.
They exchanged a few polite messages but never developed an ongoing relationship.
Bob would like to clean up his strand list by removing strands that are no longer relevant.
Susan has a former coworker she no longer works with and would prefer not to have that chat visible.
Mike accidentally created a duplicate invitation to the same person and wants to clean it up.

## Sequence
1. Bob opens his strand list.
2. He sees the chat with the person from the conference (Dave).
3. He selects the chat with Dave.
4. He chooses the option to delete/remove the strand.
5. He's asked to confirm: "Delete this conversation? This cannot be undone."
6. He confirms the deletion.
7. The chat is removed from his strand list.
8. All messages in that conversation are deleted from his device.

### Alternative Path A: Archive Instead of Delete
4. Bob chooses to archive the strand instead of deleting it.
5. The strand is moved to an "Archived" section.
6. It no longer appears in his main strand list.
7. Bob can still access archived strands if needed.
8. He can unarchive it later if he wants to reconnect.

### Alternative Path B: Other Party Still Has Access
7. The chat is removed from Bob's list.
8. Dave still has the strand in his strand list.
9. If Dave sends Bob a message, Bob receives a notification.
10. Bob can choose to ignore, block, or reopen the strand.

### Alternative Path C: Blocking Connection
4. Instead of just deleting, Bob chooses to block Dave.
5. He confirms the block action.
6. The strand is removed and Dave can no longer send Bob messages.
7. Dave will not be notified that he was blocked.
8. If Dave tries to send a message, it appears to send from his perspective but Bob never receives it.

### Alternative Path D: Accidental Deletion Recovery
6. Bob accidentally confirms deletion.
7. He immediately realizes his mistake.
8. He uses an "Undo" option that appears briefly.
9. The strand is restored with all messages intact.

### Alternative Path E: Deleting with Important Content
3. Bob notices this strand contains important documents or photos.
4. Before deleting, he exports/saves the important content.
5. Once content is saved, he proceeds with deletion.

### Alternative Path F: Mutual Strand Deletion
1. Bob and Dave mutually agree to close their strand.
2. Bob deletes the strand on his end.
3. Dave deletes it on his end.
4. Both users' strand lists are cleaned up.
5. If either wants to reconnect, they'll need to exchange a new invitation.

## Acceptance Criteria

- [ ] Users can delete strands from their strand list.
- [ ] Deletion requires confirmation to prevent accidents.
- [ ] Users can archive strands instead of permanently deleting them.
- [ ] Archived strands can be accessed and unarchived if needed.
- [ ] Deleting a strand removes messages from the user's device.
- [ ] Users can block someone to prevent future messages.
- [ ] Blocked users are not notified they were blocked.
- [ ] Users may have a brief window to undo accidental deletions.
- [ ] Users can export content before deleting strands with important information.

## Variants
- happy: a quiet strand archived
- empty: nothing to tidy up
- error: leaving does not take effect, or the act is confused with deleting

## Open

A strand cannot be deleted, only left, unless you are its last member (`STATUS.md` Appendix). This
story is still written around deletion and needs revising to make leaving the primitive.

Someone who leaves and is later invited back most likely returns as a *new* member rather than the
same one, leaving their earlier messages attributed to who they were before. Worth confirming
upstream. It is a presentation question for the member list and for old messages — not a path this
story needs before that answer arrives.
