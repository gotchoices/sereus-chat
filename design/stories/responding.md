# User Story: [Responding]

## Story Overview

**As a** Typical mobile device user,
**I want to** Respond to others who want to use Sereus Chat to communicate with me.
**So that** I can communicate securely with them, but I don't have to learn a lot of new tricks or sign up for another account or have to remember one more password.

**Context:**
[Continuation after [discovery story](./discovery.md)]

Susan is sitting in her cubical minding her own business.
She is processing her daily list of noise to squelch before she can get work done.
This typically involves responding to messages on several different platforms including text, discord, slack, telegram, signal, email, etc.
She wonders, wouldn't it be nice if all this could be on a single platform?
Suddenly Bob sticks his phone up in the air and says "Scan this."
She does.

Mike is driving when he sees a text come in from Bob.
He sees that it contains some kind of invitation link.
He responds with one of his canned macro messages "What's up?".
But then decides to click the link any way to see what happens.
Mike quickly realizes the link is a Sereus Chat link.
He knows this because he was already experimenting with the app earlier in the week and so already has it installed.

## Primary Sequence Path
1. The deep link takes Susan to a Sereus.net web page with a message that indicates that she will need to download an app in order to propertly process the invitation.  Her initial response is: "Not another app I need to learn".  Her next thought is: "And if I have to create another login and password, forget it!"
2. She is about to decline, but Bob's hand is still waving in the air.  He seems very enthusiastic so she clicks the icon on the web page that takes her to the App Store and in seconds she has this new app, Sereus Chat, on her phone.
3. A simple name-only modal appears. She enters "Su-Z"—the handle her coworkers know her by—and taps Continue (she could instead choose [Open Full Profile] to provide more info).
4. The app isn't really doing anything and she sees that she needs to connect with people first before it will be usable.  She remembers the instructions on the webpage and so, now that the app is installed, decides to scan the QR again.
5. She uses her device camera to scan the QR again (not realizing the app has a built-in scanner). (Bob's phone is still waiving patiently in the air).
6. She quickly gets an indication that she has received an invitation to chat with Bob.  She has an option to accept or decline.  She accepts
7. Now she sees a screen that looks pretty similar to all the other chat apps she is accustomed to using.
7.1. She can see she is chatting with Bob.  Seems reminiscent of like a Discord DM screen.
7.2. There is a place to type in messages.
7.3. There is a way for adding files, photos, emojis.
7.4. She can do a voice call.
7.5. She can do a video call.
8. She types in "Hi!" the message spot.
9. Suddenly Bob's phone vibrates and he (finally) pulls it back down.

**Alternative Path A: [Mike's Response]**
1. Mike is instantly launched back into Sereus Chat.
2. He accepts the invitation to chat with Bob.
3. Since he is driving, he decides to leave a voice message.
4. He speaks into the phone, recording a short message: "Hey you found this app too.  Pretty cool!".
5. He pushes Send.
6. A minute later, he sees an incoming phone call from Bob over the Sereus channel.
7. He answers it, puts the phone on speaker and the two have a great chat about how cool Sereus Chat is.

**Alternative Path B: [Email and Text sharing]**
[Continuing from Alternative Path A]:
7.1. Later in the day, Mike is reading his emails.
7.2. He notices an invitation in an email from Bob.  Out of curiosity, he clicks it.
7.3. He is again launched into Sereus Chat, but he is advised that the connection token is not valid.  He will later learn that this is because connection invitations can be used only once.  This is evidently a copy of the same invitation he responded to earlier in text.

## Acceptance Criteria

- [ ] If the app is installed, the QR invitation will take the user directly to the app and present the chat invitation for acceptance or declining.
- [ ] Initializing the app is as frictionless as possible (only a name is mandatory)
- [ ] It is clear that no account or login is being created.
- [ ] Invitation recipients rely on the trust of the person issuing the invitation (as opposed to some brand/company) to handle the link responsibly.
