# User Story: Respond to an invitation

## Story Overview

As someone who has been handed an invitation  
I want to accept it without signing up for anything  
So that I can talk to the person who invited me without learning new tricks or remembering another password.

Context: Continues from [02](02-start-a-strand.md). Susan is in the next cubicle and does not have
the app. Mike is across town and already does — he was experimenting with it earlier in the week.

## Roles

| Role | Who | Has the app |
|------|-----|-------------|
| Invitee | Susan | no — installs during this story |
| Invitee | Mike | yes |
| Inviter | Bob | waiting; his side is [02](02-start-a-strand.md) |

## Sequence

1. Susan is processing her daily list of noise before she can get any work done — text, Discord,
   Slack, Telegram, email. She wonders whether all of it could ever be in one place. Bob holds his
   phone up and says "scan this". She does.
2. Without the app installed, the link takes her to a web page that explains what she has been sent
   and what she would need to do with it. Her first thought is "not another app to learn", and her
   second is "if I have to make another login, forget it".
3. Bob's hand is still in the air, so she installs it. She is asked for a name and nothing else, and
   she can see no account is being created. She enters the handle her coworkers know her by.
   → [01](01-first-run.md)
4. She still has to get the invitation to the app she now has. She scans the code again.
5. She is shown what she is being asked to join, and can tell the important thing without having to
   ask Bob: this is a private strand, and Bob can still add people to it. That is not hidden or
   softened. It means what she says here might one day be read by somebody she has never met.
6. She can accept on those terms, decline, or ask Bob to close it first. She accepts — it is Bob,
   and she can see the situation rather than having to trust a claim about it.
7. The strand exists from this moment; before it, there was nothing.
   → [04](04-our-first-conversation.md)

### Alternative Path A: asking for it to be closed

6.1. Susan would rather this stayed between the two of them, so she asks Bob to give up his ability
     to add people before she says anything she would not want a stranger reading.
6.2. Bob does it. What she sees changes: nobody here can add anyone, so the membership is settled.
     → [02](02-start-a-strand.md)
6.3. Had he not, that would have been his answer, and hers to weigh. Neither of them is forced, and
     the app does not take a side.

### Alternative Path B: the app is already installed

1.1. Mike is driving when Bob's text arrives with a link in it. He fires back a canned "what's up?"
     and then opens the link out of curiosity.
1.2. He recognises it as a Sereus Chat link, because he installed the app last week.
1.3. It takes him straight into the app with the invitation in hand — no web page, no second scan.
1.4. He sees who is inviting him and on what terms, and accepts.
     → [04](04-our-first-conversation.md)

### Alternative Path C: an invitation already used

1.1. Later that day Mike is going through his email and finds the same invitation Bob also sent
     there.
1.2. He opens it and is told it is no longer good: an invitation is spent once it has been used, and
     this is a copy of the one he already accepted.
1.3. He is not left wondering whether something is broken, and he is not offered a way to "try
     again" that could not work.

### Alternative Path D: declining

5.1. Susan does not want this strand after all, and declines.
5.2. Nothing is created. Bob is not told who declined, because nobody has disclosed anything to him
     — there was never an identity attached to the invitation, only whoever happened to hold it.

## Acceptance Criteria

- [ ] With the app installed, an invitation opens directly in it and presents accept or decline
- [ ] Without the app installed, the user is told what they have received and how to proceed
- [ ] Getting started requires a name only; no account, login or password is created, and this is visible
- [ ] Before accepting, the user sees who is inviting them, whether the strand is private, and
      whether anyone in it can still add people
- [ ] An invitee can tell whether the membership is settled or could still grow, without asking
- [ ] An invitee may accept, decline, or ask the inviter to close the strand first
- [ ] Whether the inviter agrees is left to them; the app does not press either party
- [ ] Declining creates nothing
- [ ] An invitation that has already been used says so plainly
- [ ] Trust rests on the person who sent the invitation, not on a brand or company

## Variants

- happy: invitation accepted, strand opens
- empty: an invitee with no other strands — this is their first
- error: an invitation already used, expired, or declined

## Open

Nothing. The second scan at step 4 is **deliberate**: carrying an invitation through an app install
would mean a third-party attribution service — a host in the middle, which is the thing this app
exists to avoid. The friction is accepted. In person the code is still on the inviter's screen;
remotely, the link is still sitting in the message that carried it.
