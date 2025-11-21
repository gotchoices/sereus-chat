# Discovery – Inviting a Friend and Starting a Conversation

Based on: `design/stories/discovery.md`

Persona: Alex (new user)  
Preconditions: Alex has just installed the app; locale=en

## 1) First open – a clean slate
Alex opens the app and sees a calm empty home. There are no hebras yet, and the page gently invites him to add a friend.

<a href="chat://connections?variant=empty&locale=en&scenario=home-empty-1"><img src="../images/connections-list-empty.png" width="360" /></a>

## 2) Create an invitation
Alex taps Invite to generate a link he can share. He sees the link and a QR code he can show when they’re together.

<a href="chat://invite?variant=happy&locale=en&scenario=invite-1"><img src="../images/invitation-generator.png" width="360" /></a>

## 3) Friend accepts
Maria taps the link and is welcomed to accept. She confirms, and they’re ready to chat.

<a href="chat://invite/demo-1234?variant=happy&locale=en&scenario=accept-1"><img src="../images/invitation-acceptance.png" width="360" /></a>

## 4) Home now shows a strand
Back on Alex’s home, a new strand appears. It’s easy to spot and open.

<a href="chat://connections?variant=happy&locale=en&scenario=home-happy-1"><img src="../images/connections-list-happy.png" width="360" /></a>

## 5) Say hello
Alex opens the conversation and sends a quick greeting. Messages are easy to read and respond to.

<a href="chat://chat/t-susan?variant=happy&locale=en&scenario=chat-happy-1"><img src="../images/chat-interface-happy.png" width="360" /></a>

---

Alternates
- QR in person: If they’re together, Maria scans Alex’s code instead of using the link.  
  <a href="chat://scan?locale=en&scenario=qr-1"><img src="../images/qr-scanner.png" width="360" /></a>


