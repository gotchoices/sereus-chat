# User Story: [Discovery]

## Story Overview

**As a** Regular smartphone user,
**I want to** Communicate with other people I know and trust privately and securely
**So that** I don't get unwanted spam/messages and I can rely on my communications being private and secure.

**Context:**
Bob is busy blocking two annoying spam messages from his telegram account.
Before he is even done, some unknown person is now soliciting a response in his text messages.
For years, he has been deleting spam from his email inbox and he is sick of it all.
He would like to get messages from the people he wants to talk to but no one else.
Listening to a a podcast, he hears about Sereus Chat.

## Primary Sequence Path
1. Bob downloads the app from the play store.
2. On first launch, the app presents a simple modal asking only for his Name (required) with options: [Continue] or [Open Full Profile].
3. He enters his name (or a handle his friends will recognize) and taps Continue. (He could instead open Full Profile to provide more info.)
5. There isn't much he can see to do with the newly installed app, but it is clear from the display that he needs to invite someone else to use the app with him before he will be able to communicate with them.
6. This seems like a bother at first, but then he remembers that other people don't want him spamming them either so he begins to understand that a chat app designed to be invitation-only may have some real advantages.
7. He generates an invitation from the prominent indication on the screen.
8. It appears as a QR code with an accompanying URL type representation which he may learn later is called a deep link.
9. He sees that he can share this invitation with others in various ways such as text, email, print, etc.
10. His friend Susan is in the next cubicle so he simply holds his phone up and says: "Hey, scan this."
11. [Continue to [responding story](./responding.md)]

**Alternative Path A: [Open Full Profile]**
3.1. He chooses [Open Full Profile] from the name modal.
3.2. He sees that other more detailed information like addresses and social media pages can be entered too and fills what he wants.
3.3. He saves and returns to Home.
3.4. Continue to 5

**Alternative Path B: [Email and Text sharing]**
10. Bob shares the invitation with his brother, Mike via email.
10.1. He then gets impatient, realizing it will take some time for Mike to respond.
10.2. So he shares the same link via text.
10.3. Mike is apparently online because Bob sees him typing a response right away.
10.4. Continue to 11

## Acceptance Criteria

- [ ] From first launch of the app, the user is prompted for all information necessary to get started.
- [ ] Initially, there are no chat partners so no such list of "people I can chat with" will be evident.  However, the app clearly indicates to the user how to get started by inviting a friend to a chat channel.  Once the friend-channel as been established, he will see a clear indication of available friends/channels to choose to communicate over.
- [ ] The app feels familiar to any user who has used other messaging apps.
- [ ] The app is easily learned even by those who have not extensively used other messaging apps.
