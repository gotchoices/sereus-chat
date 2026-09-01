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
5. She is shown what she is being asked to join: who invited her, and whether this strand is
   permanently between the two of them or can take more people later. She can accept or decline.
6. She accepts. The strand exists from this moment; before it, there was nothing.
   → [04](04-our-first-conversation.md)

### Alternative Path A: the app is already installed

1.1. Mike is driving when Bob's text arrives with a link in it. He fires back a canned "what's up?"
     and then opens the link out of curiosity.
1.2. He recognises it as a Sereus Chat link, because he installed the app last week.
1.3. It takes him straight into the app with the invitation in hand — no web page, no second scan.
1.4. He sees who is inviting him and what kind of strand it is, and accepts.
     → [04](04-our-first-conversation.md)

### Alternative Path B: an invitation already used

1.1. Later that day Mike is going through his email and finds the same invitation Bob also sent
     there.
1.2. He opens it and is told it is no longer good: an invitation is spent once it has been used, and
     this is a copy of the one he already accepted.
1.3. He is not left wondering whether something is broken, and he is not offered a way to "try
     again" that could not work.

### Alternative Path C: declining

5.1. Susan does not want this strand after all, and declines.
5.2. Nothing is created. Bob is not told who declined, because nobody has disclosed anything to him
     — there was never an identity attached to the invitation, only whoever happened to hold it.

## Acceptance Criteria

- [ ] With the app installed, an invitation opens directly in it and presents accept or decline
- [ ] Without the app installed, the user is told what they have received and how to proceed
- [ ] Getting started requires a name only; no account, login or password is created, and this is visible
- [ ] Before accepting, the user sees who is inviting them and whether the strand can ever grow
- [ ] Declining creates nothing
- [ ] An invitation that has already been used says so plainly
- [ ] Trust rests on the person who sent the invitation, not on a brand or company

## Variants

- happy: invitation accepted, strand opens
- empty: an invitee with no other strands — this is their first
- error: an invitation already used, expired, or declined

## Open

Whether the invitation can survive the install, so a first-time user does not have to scan a second
time (step 4), is a deferred-deep-link question — `STATUS.md` §C. As written, this story requires the
inviter to still be standing there.
