# User Story: Settings

## Story Overview

As somebody who has used the app for a while  
I want to adjust how it looks and behaves on this phone  
So that it fits how I work — and so I can see what is genuinely mine to decide.

Context: Bob has been using the app for months. Something about notifications is not quite right and
he goes looking for the settings, expecting the usual thicket.

## Roles

| Role | Who | Note |
|------|-----|------|
| The user | Bob | everything here is about this app on this phone |

## Sequence

1. Bob opens the settings and finds a short list. That is the first thing it tells him.
2. **There is no account here.** Nothing to sign out of, no password, no linked email or phone
   number, no devices signed in elsewhere — because none of that was ever created
   ([01](01-first-run.md)). What is absent is as informative as what is present.
3. **Appearance.** Light, dark, or whatever the phone is doing.
4. **Language.** The app's own words change to suit him.
5. **Notifications.** What reaches him by default, and how loudly. Anything he has chosen for a
   particular strand stands above this ([33](33-managing-a-strand.md)).
6. **Storage.** How much room the app is taking, and how that is spread across his strands. He sets
   the ceiling himself — it is not handed down, because there is nobody to hand it down — and can
   get to trimming from here ([21](21-receiving-media.md)).
7. He looks for privacy settings and there are none. Not hidden: the decisions that would be there
   are not the app's to hold. Who can read a conversation is a property of that strand
   ([31](31-whos-in-this-strand.md)), and there is no company gathering anything for him to opt out
   of.
8. What he changes applies to this phone. His tablet can be dark while this is light, and neither is
   wrong.

### Alternative Path A: notifications that cannot arrive

5.1. Bob turns everything on and still finds messages waiting when he next opens the app.
5.2. What he set governs what the app tells him. Whether anything can reach a sleeping phone at all
     depends on something of his being awake and reachable, which is a different matter and not one
     a switch here can fix.
5.3. He is told that plainly, where he is standing, rather than left to conclude the setting is
     broken. → [42](42-staying-connected.md)

### Alternative Path B: a strand he has already decided about

5.1. Bob has the cycling group softly muted — quiet unless somebody names him.
5.2. Changing the general setting does not disturb that. A choice he made about a particular
     conversation is never quietly overridden by a general one, in either direction.

### Alternative Path C: changing the language

4.1. Bob switches the app to Spanish.
4.2. The app's own words change immediately. What people have written does not — their messages are
     their words, and nothing here translates or alters them.

### Alternative Path D: running out of room

6.1. The app reaches the ceiling Bob set.
6.2. He is told, and given the three things that are actually true: raise the ceiling, trim what he
     is holding, or give himself somewhere better to keep it
     ([42](42-staying-connected.md)).
6.3. Nothing is dropped on his behalf while he decides.

## Acceptance Criteria

- [ ] Settings are short, and their brevity is not an oversight to be apologised for
- [ ] There is no account, sign-out, password or linked identity, and the app does not imply there is
- [ ] The user can choose light, dark, or the system's own setting
- [ ] The user can choose the app's language, and only the app's own words change
- [ ] The user can set a default notification level, which per-strand choices override in both
      directions and are never silently overridden by
- [ ] The user can see how much storage the app is using and how it is distributed across strands
- [ ] Any storage ceiling is the user's to set; none is imposed
- [ ] Reaching the ceiling offers raising it, trimming, or adding capacity — and drops nothing
      unbidden
- [ ] No privacy settings are offered, because the equivalent decisions belong to a strand and there
      is nobody collecting anything
- [ ] Settings apply to this device; another device of the user's may be set differently
- [ ] Where a setting cannot deliver what it promises, the limit is stated where the setting is

## Variants

- happy: notification behaviour adjusted and understood
- empty: a fresh install, all defaults, nothing yet worth changing
- error: the storage ceiling reached

## Open

Notification settings can promise more than the platform currently delivers. Waking a sleeping phone
depends on push machinery that is design-stage, and the documented approach would need somebody's
always-on server holding platform credentials (`STATUS.md` §G). Until that settles, Alt A is the
common case rather than the exceptional one, and the honest thing is to say so where the switch is
rather than in a help page.

Settings being per-device is a deliberate choice as much as a convenience: it keeps them clear of
the problem that per-user state has no private home to live in
([gotchoices/sereus#6](https://github.com/gotchoices/sereus/issues/6)). If that changes, some of
these — language, perhaps notification defaults — might reasonably follow the person rather than the
phone. Appearance and storage should not.
