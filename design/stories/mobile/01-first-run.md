# User Story: First run

## Story Overview

As a regular smartphone user  
I want to start using a messaging app without creating an account  
So that I can talk to the people I choose without signing up, and without being reachable by anyone else.

Context: Bob is busy blocking two annoying spam messages from his Telegram account. Before he is
even done, some unknown person is soliciting a response in his text messages. For years he has been
deleting spam from his email inbox and he is sick of all of it. He would like to get messages from
the people he wants to talk to and no one else. Listening to a podcast, he hears about Sereus Chat.
Background: [theory.md](theory.md).

## Roles

| Role | Who | Note |
|------|-----|------|
| New user | Bob | has just installed the app; knows nobody on it yet |

## Sequence

1. Bob installs the app and opens it.
2. He is asked for a name, and nothing else — no email, no phone number, no password. He is told
   plainly that he is not creating an account.
3. He enters the name his friends would recognise him by and continues. He could instead fill in a
   fuller profile now, but nothing requires it.
4. He arrives at an app with nothing in it. This is expected and the app says so, rather than
   looking broken or empty by accident.
5. He is told what is missing and why: he has no strands yet. Nobody can reach him and he can reach
   nobody until he and someone else agree to a strand. This is the first time the word appears, and
   it arrives attached to something he is looking at.
6. At first this seems like a bother. Then he realises the other side of it — nobody else can reach
   him either — and an invitation-only messaging app starts to look like an advantage rather than a
   hurdle.
7. The way to start is the most prominent thing on the screen. → [02](02-start-a-strand.md)

### Alternative Path A: a fuller profile

3.1. Bob chooses to fill in more than a name.
3.2. He sees that he can add contact details, a photo, and a note about himself, and fills in what
     he wants to. He is told which of it other people would see.
3.3. He saves and returns. Continue to 4.

### Alternative Path B: he closes the app and comes back

4.1. Bob puts the phone down and opens the app again the next day.
4.2. Nothing has changed and nothing is nagging him. The app is still empty, and still says how to
     start. It has not invented activity to look busy.

## Acceptance Criteria

- [ ] First launch asks for a name and nothing else, and states that no account is being created
- [ ] The user may optionally provide more, and is told what of it others would see
- [ ] A user with no strands sees a deliberate empty state, not an apparently broken one
- [ ] The empty state explains that no one can reach the user and the user can reach no one until a
      strand exists
- [ ] The word "strand" is introduced where the user can see what it refers to, without a glossary
- [ ] The way to start a strand is the most prominent action available
- [ ] A returning user with still no strands is not nagged
- [ ] The app is recognisable to anyone who has used a messaging app before

## Variants

- happy: name entered, empty home reached, next step obvious
- empty: this whole story is the empty state
- error: a name that cannot be saved

## Open

Whether the first-run flow should also offer to scan an invitation immediately — a user whose first
contact with the app is someone else's QR code arrives here rather than at
[03](03-respond-to-an-invitation.md).
