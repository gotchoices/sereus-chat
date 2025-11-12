# User Story: [Video Call]

## Story Overview

**As a** Sereus Chat user,
**I want to** Have a video conversation with one of my connections,
**So that** I can have face-to-face communication when text messaging isn't sufficient.

**Context:**
Susan and Bob have been chatting back and forth via text for a few minutes about a work project.
Bob is trying to explain a complex diagram but it's getting tedious typing everything out.
He decides a video call would be much more efficient.
Meanwhile, Bob's brother Mike is traveling overseas and wants to video chat with Bob to show him around his hotel.

## Primary Sequence Path
1. Bob opens his chat with Susan.
2. He initiates a video call.
3. Susan's phone rings/alerts her to an incoming video call from Bob.
4. She answers the call.
5. Both can now see and hear each other.
6. Bob shares his screen to show Susan the diagram.
7. They discuss the project for about 10 minutes.
8. Bob ends the call.
9. They both return to the text chat interface.

**Alternative Path A: [Call Declined]**
4. Susan sees the incoming call but she's in a meeting.
5. She declines the call.
6. Bob sees that the call was declined.
7. Susan sends him a text message: "In a meeting, will call back in 30 min"
8. Bob replies "No problem" and continues working.

**Alternative Path B: [Voice Only]**
2. Bob initiates a voice call (not video).
3. Susan answers.
4. They have an audio-only conversation.
4.1. Midway through, Bob realizes he needs to show the diagram.
4.2. He switches the call to video mode.
4.3. Susan accepts the video upgrade.
4.4. Now both can see each other and Bob shares his screen.
4.5. Continue to 7

**Alternative Path C: [Incoming Call While Busy]**
3. Susan is already on a video call with someone else.
4. Bob's call notification appears but indicates Susan is busy.
5. Bob is given the option to wait or hang up.
6. He hangs up and sends a text instead.

**Alternative Path D: [Poor Connection]**
5. The video quality is poor and choppy.
6. Bob suggests switching to voice-only.
7. They switch to audio-only and the quality improves.
8. They complete their conversation in voice-only mode.

## Acceptance Criteria

- [ ] Users can initiate video or voice calls from within a chat.
- [ ] Incoming calls alert the recipient with clear indication of who is calling.
- [ ] Users can accept or decline calls.
- [ ] Users can switch between voice and video during a call.
- [ ] Users can share their screen during a call.
- [ ] Call status (declined, busy, poor connection) is communicated clearly.
- [ ] After a call ends, users return to the text chat interface.

