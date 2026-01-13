# Discovery – Inviting a Friend and Starting a Conversation

Based on: `design/stories/discovery.md`

Persona: Alex (new user)  
Preconditions: Alex has just installed the app; locale=en

## 1) First open – a clean slate
Alex opens the app and sees a calm empty home. There are no hebras yet, and the page gently invites him to add a friend.

[![home-empty](../images/connections-list-empty.png)](chat://connections?variant=empty&locale=en&scenario=home-empty-1)

## 2) Create an invitation
Alex taps Invite to generate a link he can share. He sees the link and a QR code he can show when they’re together.

[![invitation-generator](../images/invitation-generator.png)](chat://invite?variant=happy&locale=en&scenario=invite-1)

## 3) Friend accepts
Maria taps the link and is welcomed to accept. She confirms, and they’re ready to chat.

[![invitation-acceptance](../images/invitation-acceptance.png)](chat://invite/demo-1234?variant=happy&locale=en&scenario=accept-1)

## 4) Home now shows a strand
Back on Alex’s home, a new strand appears. It’s easy to spot and open.

[![home-happy](../images/connections-list-happy.png)](chat://connections?variant=happy&locale=en&scenario=home-happy-1)

## 5) Say hello
Alex opens the conversation and sends a quick greeting. Messages are easy to read and respond to.

[![chat-happy](../images/chat-interface-happy.png)](chat://chat/t-susan?variant=happy&locale=en&scenario=chat-happy-1)

---

Alternates
- QR in person: If they’re together, Maria scans Alex’s code instead of using the link.  
  [![qr-scanner](../images/qr-scanner.png)](chat://scan?locale=en&scenario=qr-1)


