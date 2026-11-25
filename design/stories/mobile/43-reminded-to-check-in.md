# User Story: Reminded to check in

## Story Overview

As somebody whose conversations wait while my phone sleeps  
I want a gentle reminder to look, at a pace I choose  
So that I do not leave people unanswered for days — without anybody running a service on my behalf.

Context: Bob uses the app every few days. Nothing can wake his phone when a message arrives
([41](41-settings.md) Alt A): there is no company behind the app holding the keys to the phone's
notification system, and he has not set up anything of his own that could. What arrives waits —
on the other person's phone, or on a machine of his that stays awake ([42](42-staying-connected.md))
— until he opens the app. He would like to be nudged to open it, and no more than that.

## Roles

| Role | Who | Note |
|------|-----|------|
| The user | Bob | one phone; may or may not have a machine of his own that stays awake |

## Sequence

1. In the notification settings ([41](41-settings.md)), Bob finds the plainest option the app has:
   **remind me to check in**, every so often, at an interval he picks. It is off until he turns it on.
2. He is told what it is before he turns it on: a reminder, not an alert. It does not know whether
   anything has arrived, and it will appear whether or not anything has.
3. Turning it on asks the phone for permission to show notifications, then and not at first run.
   He is also told, there, that some phones put apps they think are unused to sleep, and that a
   sleeping app's reminders do not arrive; if his does that, he is shown how to keep the app awake
   for it. He is not asked for that up front.
4. He leaves the app. If he has not been back by the end of the interval, one reminder appears,
   saying what it is: something like *Check Sereus Chat for new messages*. It does not claim there
   are any.
5. He taps it. The app opens, catches up ([10](10-catching-up.md)), and shows him what is new the
   way it always does. Nothing further is posted to his notifications while he is looking at it.
   Catching up takes as long as it takes — the app is only as quick as the network and his machines
   — so while it works he can see that it is working.
6. He leaves. The interval starts again from then.

### Alternative Path A: he ignores it

4.1. The reminder appears and Bob does nothing about it — for an hour, or a fortnight.
4.2. No second reminder follows. There is at most one waiting at a time, and a new one is only ever
     set when he leaves the app. Ignoring it is a complete answer; he is never pestered for it.

### Alternative Path B: he dismisses it

4.1. Bob swipes the reminder away without opening the app.
4.2. Exactly as if he had ignored it: nothing more until he next visits and leaves.

### Alternative Path C: he comes back on his own

4.1. Bob opens the app before the interval is up.
4.2. No reminder appears. The interval starts again when he leaves.

### Alternative Path D: he says no to the permission

3.1. Bob declines when the phone asks.
3.2. He is told the reminder cannot be shown without it, and how to change his mind later. Nothing
     else in the app changes, and he is not asked again unprompted.

### Alternative Path E: nothing new

5.1. Bob taps the reminder; nothing has arrived since he last looked.
5.2. Once the app has caught up, it says so plainly — nothing new since he last looked — rather than
     leaving him to watch it look busy and wonder.

### Alternative Path G: he leaves before it has caught up

5.1. Bob taps the reminder, glances, and leaves while the app is still catching up.
5.2. The app finishes the check anyway, for a short while after he has gone, and he can see from
     his notifications that it is still checking.
5.3. When it is done it leaves one notification saying what it found — something new, or nothing —
     then stops. This is the only time the app posts anything after a reminder, and only because he
     was no longer looking.
5.4. If the phone does not give it long enough to finish, the notification says it could not finish
     checking, rather than implying nothing arrived.

### Alternative Path F: a notification service of his own

1.1. Bob — or somebody he trusts — runs a service that can actually reach a sleeping phone when
     something arrives.
1.2. He can point the app at it. The app never chooses such a service for him and ships none of its
     own: what he names is the only thing that will ever be told when to wake his phone.
1.3. With one in place, he can be alerted that something has arrived, which makes the reminder
     unnecessary; he may keep both. With none named, reminders are all the app offers, and it says
     so rather than implying more.

## Acceptance Criteria

- [ ] Reminders are off by default and offered as the simplest notification option
- [ ] The user chooses the interval
- [ ] The option is described as a reminder that does not know whether anything has arrived, before
      it is turned on
- [ ] Permission to show notifications is asked when the option is turned on, never at first run
- [ ] A reminder appears only after the chosen interval has passed since the user last left the app
- [ ] At most one reminder is ever waiting; ignoring or dismissing it means no more until the next
      visit
- [ ] Opening the app by any route clears a waiting reminder and starts the interval again on leaving
- [ ] A reminder's wording never claims that anything has arrived
- [ ] Tapping a reminder opens the app, which catches up and shows what is new in the usual places;
      nothing more is posted while the user is looking
- [ ] Having caught up, the app says plainly when nothing is new
- [ ] If the user leaves before the check is done, the app finishes it briefly, visibly, and leaves one
      notification with the result — or saying it could not finish
- [ ] Where a phone's power management can stop reminders, the user is told at the setting and shown
      how to exempt the app; that is never asked up front
- [ ] Declining the permission is explained once, changes nothing else, and is not re-asked unprompted
- [ ] A notification service of the user's own can be named; the app ships and chooses none, and with
      none named it promises nothing beyond reminders

## Variants

- happy: reminder shown, tapped, the app caught up with something new
- empty: reminder tapped, nothing new
- error: notifications not permitted
- left early: the check finished after the user left, and its one notification

## Open

**Bring your own notification service (Alt F).** Deliberately left open. What it must preserve is
the point of the app: no company in the middle, and nothing told about Bob's phone except by
something he chose. Candidates, none decided:

- Bob's own always-on machine ([42](42-staying-connected.md)) is the natural thing to notice an
  arrival first; whatever he names would be how it reaches the phone.
- On Android, UnifiedPush is an existing open standard for exactly this: the user installs a
  distributor they choose (self-hosted or a provider they trust) and apps deliver through it.
- On iPhone, a sleeping phone can be woken only through Apple's service, which needs credentials
  held by a publisher. Without one, iPhone users may only ever have reminders; that should be said
  where the setting is, not discovered.

**What the reminder knows.** By design, nothing: it is set when Bob leaves and fires on time alone,
so it needs no background work of its own — only the short, visible window after a tap (Alt G). If the app later
learns to check for activity in the background without being opened (sereus is discussing a cheap
"what changed?" question one's own machines could answer), the same setting could become *tell me if
something arrived* — and its wording would change to match what it then knows.

**Relationship to other notification choices.** A reminder is its own opt-in and concerns the app as
a whole. Muting is a choice about a particular strand ([33](33-managing-a-strand.md)), and the
default level in [41](41-settings.md) governs what messages may reach him; neither affects a
reminder, which never names a strand or a person.

**No quiet hours.** Only the interval is chosen. A reminder is set only when Bob leaves the app, so
the most any quiet stretch can ever bring is one.
