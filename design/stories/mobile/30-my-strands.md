# User Story: My strands

## Story Overview

As a Sereus Chat user with several strands  
I want to View all my strands and easily select who I want to chat with  
So that I can efficiently communicate with the right person without searching through clutter.

Context: After using Sereus Chat for a few months, Bob now has strands with 15 people including family, friends, and coworkers.
Some conversations are very active, others haven't been touched in weeks.
Bob wants to message his coworker Sarah about a project but can't remember if they already share a strand or if he needs to invite her.
Susan has 30+ strands and is getting overwhelmed trying to find specific people.

## Sequence
1. Bob opens Sereus Chat to his main screen.
2. He sees a list of all his active strands.
3. The list shows each person's name and the most recent message preview.
4. He scrolls through the list looking for Sarah.
5. He doesn't see Sarah in his strand list.
6. He realizes he hasn't invited Sarah yet.
7. He generates a new invitation to send to Sarah.

### Alternative Path A: Finding and Selecting Strand
4. Bob sees Sarah in his list.
5. He taps on Sarah's name.
6. The chat interface opens showing their conversation history.
7. He types and sends his message about the project.

### Alternative Path B: Filtering by Name
1. Susan opens Sereus Chat and sees her long list of 30+ strands.
2. She uses the search/filter feature.
3. She types "Mar" to find her sister Martha.
4. The list immediately filters to show only matching names.
5. She sees Martha and two other strands with "Mar" in their names.
6. She selects Martha.
7. The chat opens and she sends her message.

### Alternative Path C: Sorting Strands
2. Bob wants to focus on his most active conversations.
3. He sorts his strands by most recent activity.
4. His most active chats appear at the top.
4.1. He notices conversations with Mike and Susan at the top.
4.2. Old conversations with acquaintances are near the bottom.
5. He easily finds and opens his chat with Mike.

### Alternative Path D: Viewing Strand Details
4. Bob finds Sarah but wants to verify it's the right Sarah before messaging.
5. He views Sarah's profile details.
6. He sees the profile information Sarah shared (name, email).
7. He confirms it's his coworker Sarah.
8. He opens the chat and messages her.

### Alternative Path E: No Active Conversations
2. Bob sees that several strands exist but no messages have been exchanged yet.
3. These appear in his strand list with an indicator showing "No messages yet".
4. He selects one and initiates the first conversation.

## Acceptance Criteria

- [ ] Users see a list of all their strands when opening the app.
- [ ] Each strand shows the person's name and recent message preview.
- [ ] Users can search/filter strands by name.
- [ ] Users can sort strands (by recent activity, alphabetically, etc.).
- [ ] Users can view strand profile details.
- [ ] Users can easily distinguish between active conversations and new strands with no messages.
- [ ] Selecting a strand opens the chat interface.
- [ ] Users can identify when they need to create a new invitation for someone not in their list.

## Variants
- happy: several strands, one opened
- empty: no strands yet — the first-run state
- error: the list cannot be loaded

## Open

How a group strand is titled and pictured when it has no single partner. `ops.md` still returns one
partner name and avatar per strand — see `STATUS.md` §F.

Nicknames for strand partners are **provided by sereus**, not invented here: a user may name a
partner privately, and the partner need not ever know. This story should surface them rather than
build its own. Sereus also intends, eventually, to group a user's strands across sApps by that same
private name — every strand with the person the user calls "Bobaroo", chat and otherwise — which is
what would one day let a user cross from a chat strand to a tally with the same person. Nothing is
required of this story now beyond not making that harder.
