# Stories Status and Planning

## Completed Stories

- [x] Discovery - Initial app installation and invitation generation
- [x] Responding - Accepting invitations and connecting with others
- [x] Video Call - Voice and video communication
- [x] Sending Media - Photos, videos, documents, voice messages
- [x] Managing Connections - Viewing and organizing connections list
- [x] Searching Messages - Finding content across conversations
- [x] Editing Messages - Modifying or deleting sent messages
- [x] Deleting Channels - Removing or archiving chat channels

## Stories in Progress

None currently

## Future Story Topics to Consider

### Communication Features
- [ ] Group chats (multi-person conversations)
- [ ] Reactions/emojis on messages (like, love, thumbs up, etc.)
- [ ] Message threading/replies (responding to specific messages)
- [ ] Forwarding messages to other connections
- [ ] @mentions in conversations
- [ ] Message read receipts and typing indicators
- [ ] Scheduled messages (send later)

### Media and Content
- [ ] Taking/sending photos directly from in-app camera
- [ ] Live photo sharing or streaming
- [ ] Collaborative document viewing/editing
- [ ] Screen sharing during text chat (not just during calls)
- [ ] GIF/sticker support

### Security and Privacy
- [ ] Verifying identity of connections (beyond initial invitation)
- [ ] End-to-end encryption indicators
- [ ] Disappearing/temporary messages
- [ ] Screenshot notifications
- [ ] Two-factor authentication for app access
- [ ] Backup and restore of conversations

### Organization and Productivity
- [ ] Pinning important conversations to top of list
- [ ] Muting notifications for specific channels
- [ ] Setting custom notification preferences per connection
- [ ] Marking conversations as unread
- [ ] Creating conversation tags or categories
- [ ] Setting reminders within chats

### User Profile and Settings
- [ ] Updating profile information (name, photo, etc.)
- [ ] Setting profile visibility/privacy levels
- [ ] Custom status messages ("Away", "Busy", "Available")
- [ ] Dark mode and appearance settings
- [ ] Notification sound customization

### Advanced Features
- [ ] Voice assistant integration
- [ ] Translation of messages in different languages
- [ ] Chat backup to cloud service
- [ ] Multi-device support (phone, tablet, desktop)
- [ ] Import/export chat history
- [ ] Integration with calendar for meeting scheduling

## Unresolved Questions

### Invitation System
- **Q**: Can invitations expire after a certain time period?
- **Q**: Can a user generate multiple invitations to the same person?
- **Q**: What happens if both users try to invite each other simultaneously?
- **Q**: Can invitations be revoked after being sent but before acceptance?

### Message Editing
- **Q**: Is there a time limit on how long after sending a message can be edited?
- **Q**: Can recipients see edit history, or just that it was edited?
- **Q**: If a message is deleted, does it disappear completely or show "Message deleted"?
- **Q**: Can users delete messages from both sides of the conversation?

### Channel Management
- **Q**: If Bob deletes a channel, does it affect Dave's view of the conversation?
- **Q**: Can users temporarily "mute" channels without deleting?
- **Q**: Should there be a "favorites" or "important" designation?

### Media Handling
- **Q**: What are the file size limits for photos, videos, documents?
- **Q**: How long are media files stored? Are they automatically deleted after a period?
- **Q**: Can users control whether media auto-downloads or requires manual download?

### Group Conversations
- **Q**: Will the app support group chats (3+ people)?
- **Q**: If so, how do invitations work for groups?
- **Q**: Can admin roles be assigned in groups?

### Technical/System
- **Q**: How does offline mode work? Can users compose messages without connectivity?
- **Q**: How are conflicts resolved if a user edits a message while offline?
- **Q**: What happens if a user reinstalls the app - is conversation history preserved?
- **Q**: Will there be a web version or is it mobile-only?

### User Experience
- **Q**: Should there be a tutorial/onboarding flow for new users?
- **Q**: How do users report spam or abusive connections?
- **Q**: Is there a way to "soft block" someone (ignore without them knowing)?

## Notes

- Stories focus on "what" users need, not "how" it's implemented
- Specs will be added later to define "how" for each screen
- Each story should have clear acceptance criteria
- Alternative paths should use dotted notation (3.1, 3.2) for sub-steps



## Notifications backlog (edge case)
- [ ] User receives an invitation notification to connect
- [ ] Clears OS notifications without responding
- [ ] Needs a notifications page (like Discord) to review unprocessed invitations
- [ ] Consider entry via Profile (or Home header)
- [ ] Define story and screens for notifications queue
