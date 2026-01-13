# User Story: [Searching Messages]

## Story Overview

**As a** Sereus Chat user with extensive conversation history,
**I want to** Search through my messages to find specific content,
**So that** I can quickly locate important information, photos, or conversations from the past.

**Context:**
Bob remembers that Mike sent him the name of a great restaurant a few weeks ago, but he can't remember the name or when exactly it was mentioned.
They've exchanged hundreds of messages since then.
Susan needs to find a document that Bob sent her last month about the project proposal.
Mike is trying to find a specific photo Bob sent showing Emma's soccer uniform number.

## Primary Sequence Path
1. Bob opens Sereus Chat.
2. He initiates a search across all his conversations.
3. He types "restaurant" as his search term.
4. Results appear showing all messages containing "restaurant" from various conversations.
5. He sees a message from Mike from 3 weeks ago mentioning "Bella Vista restaurant".
6. He taps on that result.
7. The app opens his chat with Mike and scrolls to the specific message.
8. Bob reads the context around that message to get the full details.

**Alternative Path A: [Searching Within Single Conversation]**
1. Bob opens his chat with Mike.
2. He searches within just this conversation.
3. He types "restaurant".
4. Results show only messages in this chat containing "restaurant".
5. He finds the specific message he was looking for.
6. The chat scrolls to that message.

**Alternative Path B: [Searching for Media]**
1. Mike wants to find the soccer uniform photo Bob sent.
2. He searches for media/photos in his chat with Bob.
3. He filters to show only image results.
4. Thumbnails of all photos Bob sent appear.
5. He scrolls through and finds the uniform photo.
6. He taps it to view full size.

**Alternative Path C: [Searching by Date Range]**
1. Susan knows Bob sent the document sometime in early December.
2. She searches within her chat with Bob.
3. She filters to only show messages from December 1-15.
4. She further filters to only show messages with attachments.
5. She finds the document and opens it.

**Alternative Path D: [No Results Found]**
4. Bob searches but no results appear for "restaurant".
5. He realizes he may have the wrong search term.
6. He tries "Italian food" instead.
7. Results appear and he finds the message he was looking for.

**Alternative Path E: [Searching for Person]**
1. Bob received a message mentioning his coworker "Sarah".
2. He searches for "Sarah" across all conversations.
3. Results show every message mentioning Sarah from different chats.
4. He finds the specific mention he was looking for in his chat with Susan.

## Acceptance Criteria

- [ ] Users can search across all conversations.
- [ ] Users can search within a specific conversation.
- [ ] Search results show the message text, sender, and date.
- [ ] Tapping a search result opens the conversation and scrolls to that message.
- [ ] Users can filter search results by media type (photos, videos, documents).
- [ ] Users can filter by date range.
- [ ] Search is fast and responsive even with extensive conversation history.
- [ ] Search handles variations in spelling and capitalization.

