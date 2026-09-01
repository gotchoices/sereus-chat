# Theory: what Sereus Chat is for

Not a formal story. This is the plain-language background the numbered stories assume — what is
wrong with the messaging apps everyone already has, and what a strand is. It ends where the app
begins; the numbered stories take it from there.

The platform underneath is [sereus](https://sereus.org). This page nods at what sereus provides.
It does not re-explain it, and nothing here defines platform behavior.

---

Susan: You're going to tell me to install another app, aren't you.

Bob: I am.

Susan: I have six. I don't want a seventh.

Bob: How many of the six can someone reach you on without your say-so?

Susan: All of them. That's the whole problem — I spend the first twenty minutes of every day
deleting things I didn't ask for.

Bob: So why *can* they reach you?

Susan: Because they've got my number. Or my handle. Or my email.

Bob: Because you have an address, and the app's whole job is to deliver anything sent to it. It has
to work that way. There's a company in the middle, and it needs somewhere to put the message. Which
means there's a list of everybody, and you're on it.

Susan: A directory.

Bob: A directory. Maybe not one you can sit and browse, but one that can be looked up, leaked,
sold, bought, or just guessed at. All six of your apps have one. Every piece of junk you deleted
this morning came through it.

Susan: And yours doesn't.

Bob: There's nothing to look me up in. I don't have an address you can send to. If you and I have
never agreed to talk, there's no route from you to me. Not a blocked one, not a filtered one.
None.

Susan: Then how does anybody ever start?

Bob: Out of band. I hand you a code, or send you a link — however I'd have reached you anyway. You
accept, or you don't. Once you accept, there's a strand between us.

Susan: A strand.

Bob: The conversation, and the agreement that it exists. Not a friend request, not a contact card —
the thing we both hold. The messages live in it. If we never make one, we've got no way to talk,
and that's deliberate.

Susan: So spam is—

Bob: Not filtered. Absent. Nobody can send me anything unless I already agreed to a strand with
them. There's no inbox for strangers to fill up.

Susan: What about groups? Because that's where it always goes wrong for me. I join some work
channel, and three days later I'm getting messages from people I've never met.

Bob: Same directory problem, different hat. On those apps, joining a group hands your handle to
everyone in the room.

Susan: Which nobody mentions at the time.

Bob: Here, a strand is *between* the people in it. It isn't a person's address. If you and I are
both in a group strand, I can talk to you there — that's all it gets me. If I want a private
conversation with you, I have to invite you to a new strand, and you have to accept. Same as a
stranger would.

Susan: So being in a room with someone doesn't hand them a key to my front door.

Bob: Membership isn't exposure. That's the part the other apps get backwards.

Susan: Who decides who's in a group?

Bob: It's either private — only people who get invited — or open to anyone with the link. If it's
open, nobody's in charge of it at all: anyone can wander in, and nobody can be thrown out. If it's
private, somebody has to be able to bring people in. Me, to start with. I can pass that on to
whoever I invite, or keep it, or give it up entirely.

Susan: And if you give it up?

Bob: Then it's whoever's already in, forever. Nobody can add anyone, including me. Nobody can put
anyone out, either. It can't be undone, so it's not a mood I can change later.

Susan: Put out?

Bob: Same ability. Whoever can bring people in can remove them — each other included, so it's not
like there's a boss. While anybody in a strand still has it, you're in there at their discretion. In
one where nobody has it, you're just in there.

Susan: And I'm supposed to take your word for that?

Bob: No — that's the whole point. You can see it. Before you accept, and any time afterwards, you
can see whether anyone in here can still add somebody. If they can, then what you say might one day
be read by a person neither of us has met. If nobody can, it's settled.

Susan: Why would I care up front?

Bob: Because a strand is shared. Whoever's in it holds it, history and all. Somebody added next
year can read what we say today.

Susan: That sounds bad.

Bob: It's honest, and it's how it works at all with no company holding our messages for us. It's
also why being able to see the difference matters. If nobody in here can add anyone, then you know
today who will ever read this. None of your six can tell you that, because there it's the company's
call, not yours.

Susan: You keep saying agreement. Like terms of service?

Bob: More like a contract between us, and not necessarily a toothless one. It can say the strand is
confidential. Agreements like that can carry consequences — that's sereus's business, not something
the chat app makes up. What it means for you is that "this is private" can be a commitment somebody
made, instead of a setting some company could quietly change next Tuesday.

Susan: And who's running the whole thing?

Bob: Nobody. That's the trade. No company holding your messages means none to be breached,
subpoenaed, sold, or to change its mind about you. It also means nobody keeping the lights on for
you — your own machines do that. It's a real cost, and the app doesn't pretend otherwise.

Susan: Give me the honest version.

Bob: Nothing works until you invite somebody or somebody invites you. Nobody can find you, which is
the feature and occasionally the nuisance. And if a conversation ought to stay between two people,
decide that when you start it, not afterwards.

Susan: Fine. Show me the code.

---

## What this means for the stories

- **There is no directory and no discovery.** Every story that starts a conversation starts with an
  invitation shared out of band.
- **Unsolicited contact is structurally absent, not filtered.** Stories should not invent spam
  controls for a channel that does not exist.
- **Membership is not an address.** Being in a group strand with someone gives no private route to
  them. A one-to-one conversation takes a new strand and their acceptance, like any other.
- **A strand is private or public, and its membership either can still change or cannot.** While
  anyone in it holds the ability, they can add people and remove people; that ability can be passed
  on, and can be given up permanently, which settles the membership in both directions. Because a
  new member holds the whole history, and because removal is possible, whether a strand is still
  managed is both a confidentiality fact and a tenure fact — and one every member can see at any
  time.
- **The agreement governing a strand, including confidentiality and any enforcement, is sereus's**
  to define. Stories show a user encountering it; they never specify it.
- **"Strand" is the word**, in the app as much as in the specs. This page is where it is
  introduced; the numbered stories assume it.
