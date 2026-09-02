# Stories Status & Improvement Plan

Tracks how far each story has come, and the plan to get the set to the depth the app needs.

The set itself and its reading order live in [index.md](index.md). Format authority is
`appeus/templates/stories/story-template.md` and `appeus/agent-rules/stories.md`.

States: **stub** (topic only) → **drafted** (written, not human-reviewed) → **reviewed** (human
has read and accepted it) → **revised** (changed after review).

---

## Scope of this round

Focus is the **UX of interacting with friends and contacts**: how I find people, start a strand,
and send and receive messages. Cadre, key custody, replication and strand formation internals are
**sereus's** to design — stories touch them only at the level a user experiences ("he added a node
so his messages would stop getting stuck"), never at the level of mechanism.

Settled positions:

- **Group strands are supported from inception.** A strand is 2–N parties, and the app is a
  manager of *many* strands — a user sees every strand they are a member of, whether it holds two
  people or twenty. Stories are written for N from the start rather than retrofitted.
- **Strand permissions belong to sereus.** A private strand has **no owner — it has *n* managers**
  (confirmed upstream, see the Appendix). A manager may grant permission to invite members and
  managers; that is the whole of the permission model. Stories should be *aware* of this and show a
  user encountering it — "this conversation can't take more people" — but must never invent the
  model or its UI. A strand's agreement may also carry confidentiality terms and real enforcement;
  stories may say a strand *is* confidential, never how that is enforced.
- **Membership is not an address**, and the app must not soften this. Sharing a group strand with
  someone gives no private route to them, and generally no way to *invite* them either — a strand
  carries their display identity, not a means of reaching them. Unless the strand happens to carry
  enough to identify them out of band, the only move is to post an invitation into the group strand
  where every member can see it. That is awkward on purpose; it is what keeps group membership from
  becoming DM exposure, and it is a rule stories must not quietly break.
- **A new member sees the history.** This falls out of the strand being a replicated database:
  joining means getting the database, and there is no per-member visibility to design. That is
  precisely why the strand contract matters — agreeing up front that a strand is fixed at two is
  the only way either party can know their messages stay within that set of eyes. Stories state
  the consequence once, plainly, at the point the choice is made; they do not explain the
  mechanism, and they never imply history can be scoped.
- **Voice/video calling — kept as an objective, sequenced last.** Likely built on a non-sereus
  library, and likely requires at least one participant to run a full-time cadre node. The story
  stays in the set (numbered `90`) so the objective isn't lost, but it is not developed until the
  messaging surface is done.
- **Forwarding between strands is in scope.** Cross-strand by nature, and the natural payoff of
  managing many strands.
- **Cadre management — out of scope as a story subject.** Chat renders a sereus-provided component
  (`src/cadre-ui/`). One brief story (`42`) covers only what a chat user perceives; it must not
  specify cadre UI.

## Where the set actually stands

The restructure in §D is **done**: files renumbered, splits made, stubs created, index rewritten
(§A). No story is human-reviewed yet, and the seven carried-over stories still hold their
pre-sereus content.

States: **stub** (topic only) → **drafted** (written, not reviewed) → **reviewed** (human has read
and accepted it) → **revised** (changed after review).

| # | Story | State | Next |
|---|-------|-------|------|
| 01 | [First run](01-first-run.md) | drafted | review |
| 02 | [Start a strand](02-start-a-strand.md) | revised | review — private/public, invite rights per invitation, resignation seals it |
| 03 | [Respond to an invitation](03-respond-to-an-invitation.md) | revised | review — invitee inspects the strand, may ask for it to be closed |
| 04 | [Our first conversation](04-our-first-conversation.md) | revised | review — no delivery or read reporting |
| 05 | [Add someone to a strand](05-add-someone-to-a-strand.md) | revised | review — refusals, promotion, removal |
| 10 | [Catching up](10-catching-up.md) | revised | review — hard and soft mute; no receipts |
| 11 | [Writing a message](11-writing-a-message.md) | stub | draft |
| 12 | [Replying and mentioning](12-replying-and-mentioning.md) | stub | draft |
| 13 | [Correcting a message](13-correcting-a-message.md) | revised | review — no edit history, no time limit, no tombstone |
| 20 | [Sending media](20-sending-media.md) | renamed | trim; pair with 21 |
| 21 | [Receiving media](21-receiving-media.md) | stub | draft |
| 22 | [Forwarding a message](22-forwarding-a-message.md) | stub | draft |
| 30 | [My strands](30-my-strands.md) | renamed | reframe from contacts to strands; drop the email-disclosure claim |
| 31 | [Who's in this strand](31-whos-in-this-strand.md) | stub | draft |
| 32 | [Finding something](32-finding-something.md) | renamed | reconcile with "no global index" |
| 33 | [Managing a strand](33-managing-a-strand.md) | revised | review — mute / leave / forget, plus being removed |
| 40 | [My profile](40-my-profile.md) | drafted | review |
| 41 | [Settings](41-settings.md) | stub | draft |
| 42 | [Staying connected](42-staying-connected.md) | stub | draft, briefly |
| 90 | [Voice and video call](90-voice-and-video-call.md) | parked | after messaging |

**Coverage assessment (non-sereus content only):** the set covers the *sender's* side of a classic
messaging feature list at moderate depth, and largely skips the *receiving and reading* half of the
app. Roughly half the everyday UX surface is unwritten. The covered portion is in places broader
than it should be (call screen-sharing, edit history) while more fundamental ground (unread triage,
replying, drafts, viewing a received photo) has no story at all. Adding group strands widens the
gap: nothing in the set describes membership, joining, leaving, or a message from someone you did
not personally invite.

---

## A. Format and style cleanups

The set does not currently conform to what appeus expects. All of these are mechanical.

- [x] **Number the files.** `agent-rules/stories.md` states the rule plainly: "Stories: numbered for
      order (`01-browsing.md`)". We use unnumbered kebab-case and carry ordering in index.md
      instead. Adopt gapped numbering (see §D) so stories can be inserted without renaming.
- [x] **Add a `## Variants` section to every story** (`happy` / `empty` / `error`). No story has one.
      The template requires it and appeus's scenario lane consumes it, so its absence blocks
      downstream generation.
- [x] **Normalize section headings** to the template: `## Story Overview`, `## Sequence`,
      `## Acceptance Criteria`. We currently use `## Primary Sequence Path`, and
      40-my-profile.md is off-template entirely (`# Story:`, `## Context / Triggers`,
      `## Sequence (Primary)`, `## Alternative Paths`).
- [x] **Drop bracketed titles.** `# User Story: [Discovery]` → `# User Story: Discovery`.
- [x] **Normalize the As-a/I-want/So-that block** to the template's plain form; drop the `**As a**`
      bolding and trailing commas.
- [ ] **Make alternative-path numbering mean something.** The template distinguishes dotted
      sub-steps (return to the next main step) from renumbered main steps (replace a segment). We
      mix both without signalling which, and several paths never state where they rejoin.
      20-sending-media.md Alt B ends "Continue to 6" but its own step 6 is a different action.
      **Partly done:** alternative paths are now `### Alternative Path X: name` headings throughout,
      but the return points still need settling story by story, during revision.
- [x] **Fix 01-first-run.md's skipped step** — the primary sequence runs 3 → 5.
- [x] **Adopt "strand" as the user-facing word**, replacing "connection", "channel" and "chat",
      which are used interchangeably today. With groups, "connection" is actively misleading — a
      strand is not a person. Using one word in the app, the stories and the specs also removes the
      translation layer between what a user says and what the platform calls it, and propagates the
      sereus vocabulary rather than hiding it.
      **The word carries an obligation: it has to arrive intuitively.** Nobody knows what a strand
      is on install, so the stories must teach it in passing rather than defining it. The natural
      places are story 01's empty Home (where the app already has to explain that there is nothing
      here until you invite someone) and story 02's fixed-vs-growable choice (where "who is on this
      strand" is the actual subject). Make it testable: a first-time user should be able to say
      what a strand is without opening help.
      Apply to prose, acceptance criteria, screen and route names, and the Home header's
      contact-flavored "Add Friends" label.
      **Done in the stories.** The five carried-over files still read as contact-era prose in
      places; that clears when each is revised. Screen and route names are §E, not done here.
- [x] **Rewrite index.md** to carry grouping and *deliberate deferrals*, not just an ordered list.
      Add `theory.md` to its excluded-files line alongside `AGENTS.md`, `README.md` and `STATUS.md`.

### Conventions worth adopting from taleus

Not required by the template, but they have earned their place in
`ser/taleus/packages/taleus-app/design/stories/mobile/`:

- [x] **`## Roles` table.** Previously suggested for two-party stories; with groups it matters more,
      because a story now has a manager, a member who may invite, and a member who may not.
- [x] **`## Open` section** naming known-unknowns and pointing at the ticket or upstream decision
      that settles them. This is exactly where "waiting on sereus" belongs, per story.
- [x] **State + reason tracking in this file** (`revised — dropped X because Y`) rather than a
      checkbox.

---

## B. Corrections to existing content

Concrete defects, worth fixing regardless of the restructure.

- [ ] **Profile disclosure contradiction.** 30-my-strands.md Alt D says Bob "sees the profile
      information Sarah shared (name, email)". `specs/domain/schema.md` shares only `Name` and
      `AvatarUri` via `Member`; email/phone/notes are device-local and never leave the device.
      Either the schema grows a disclosure model or the story loses the claim. **Recommend the
      latter** — and solve the real need (telling two Sarahs apart) with local nicknames (§C.10).
      Groups sharpen this: in a group my name and avatar are visible to people I never invited.
- [ ] **Search performance contradiction.** 32-finding-something.md requires search that is "fast and
      responsive even with extensive conversation history"; `specs/domain/interfaces.md` says search
      iterates attached strand DBs with "no global index", and cold strands fault in on demand. The
      story needs to acknowledge a progressive/scoped search, or the domain contract needs an index.
- [x] **Edit and delete: the operation is sound, the reassurance is not.** *(Applied to story 13.)* Delete is an ordinary
      table mutation — removing a `Message` or `Attachment` row propagates as shared strand state
      and every member's app stops showing it. So 13-correcting-a-message.md Alt B (removing a photo from
      a sent message) is implementable as written. What must be rewritten is the promise around it:
      in a distributed world a node may have cached or backed the content up, and we have no reach
      over that. Prefer "removed from the conversation" to "deleted"; never offer a permanence we
      cannot deliver. A growable strand adds a second reason not to sell deletion as containment —
      the audience for anything already said can widen after the fact. A member may delete only
      their own content; there is no moderation reach over anyone else's messages.
- [x] **Deleting a strand is a different act from deleting a message** *(applied to story 33)*, and the old story
      blurs three things: leaving a strand, discarding my local copy, and removing content for
      every member. Its "all messages deleted from his device" is a local act and unproblematic;
      its brief Undo is implementable as a re-insert, but should be specified rather than assumed.
- [x] **`Status: sent/delivered/read` — drop the column.** Decided: no delivery or read state is
      tracked at all. A reply is the evidence a message was read; beyond that the app claims
      nothing. Stories 04 and 10 are written this way. The schema change is in §F.
- [ ] **90-voice-and-video-call.md is over-specified** for something we're deferring — mid-call video upgrade and
      screen sharing are asserted as free. Trim to the objective and mark the dependencies. Note
      that group calling is a further question, not assumed.

---

## C. Story holes to fill

Ordered by how much they hurt. All are ordinary chat UX; none require deciding anything about
sereus internals.

1. ~~**Receiving and catching up — no story exists.**~~ **Done — story 10 is drafted.** Every current story is authored from the
   sender's chair. Nothing covers opening the app to three unread conversations: where do I land,
   how do I triage, what does unread look like, where's the unread divider in a long thread, how do
   I jump to the latest, can I mark something unread again to deal with later. This is the largest
   single gap and it is pure UX. Groups add the case that actually drives triage — a busy strand I
   am not personally addressed in, versus one where I was mentioned.

2. **Composing beyond one line.** No story covers drafts preserved when you leave a chat and come
   back, multi-line entry, pasting, links, copying message text, or what a message that hasn't gone
   out yet looks like and how to retry it. `screens/chat-interface.md` already promises an
   "Error: inline banner with retry" that no story describes. Drafts matter more with many strands.

3. **Reply, quote, and mentions.** `screens/chat-interface.md` already specifies "Long-press others'
   message → reply/copy menu". The screen has it; no story does. Groups settle the open question in
   favor of **quote-reply** — with several people talking, replying to a specific message is how a
   conversation stays legible, and `@`-mentions become the mechanism that makes notifications
   bearable. Full threading remains out.

4. **Reactions.** 03-respond-to-an-invitation.md step 7.3 mentions emoji in passing; 20-sending-media.md has Mike
   answering with a thumbs-up. Neither says whether that's a reaction or just a message containing
   an emoji. Reactions scale better than messages in a group — worth promoting out of "future".

5. **Membership — who is in this strand.** Entirely absent, and now required. Seeing the member
   list, telling a manager from a member, understanding whether this strand can grow and who may
   grow it, watching someone join, and leaving a strand yourself. A new member sees the whole
   history, so the story's job is to make that unsurprising — not to offer controls over it. It is
   also where membership-is-not-an-address gets uncomfortable and the story has to be straight
   about it: tapping a fellow member opens no private chat, because none exists, **and generally
   offers no way to invite them either** — there is no address to send to. What is left is posting
   an invitation into the group strand for everyone to see, which raises its own question the story
   must answer: if invitations are single-use, the wrong member can take one meant for someone
   else. The permission *rules* are sereus's; what the user sees and can attempt is ours.

6. ~~**Adding someone to an existing strand.**~~ **Done — story 05 is drafted.** Distinct flow from starting a new one, and the point
   where the user meets the strand's own limits. Two refusal shapes are worth showing, since they
   are how the contract becomes visible without our explaining it: the strand itself does not allow
   growth ("this conversation was set up for two"), and the member is not permitted to grow it
   (they are not a manager). Also the moment where an invitation is scoped to a strand rather than
   to a person, and where the user should understand that whoever joins can read what was already
   said.

7. **Receiving media.** Sending is covered in six alternative paths; receiving is one line ("Mike
   plays the video"). Nothing on full-screen viewing, zoom, swiping between images in a
   conversation, saving to the camera roll, or a per-conversation media gallery — the last of which
   32-finding-something.md Alt B already gestures at.

8. **Forwarding between strands.** Confirmed in scope. Pick a message, choose one or more other
   strands, send it on — with the question of whether the original sender is attributed, and what
   the user is told about re-sharing something from a private conversation.

9. **Message presentation.** Date separators, grouping consecutive messages from one sender,
   relative vs. absolute timestamps, and scroll-position restore are unspecified anywhere in the
   design. Groups add sender names and avatars on incoming bubbles — already anticipated by
   `components/index.md` ("optional sender name (group)") but never storied.

10. **Local nicknames — surfaced, not invented.** Susan calls herself "Su-Z"; Bob wants to file her
    as "Susan (work)". Sereus provides this: a user may name a partner privately, and the partner
    need not know. It is the honest fix for 30-my-strands.md's "is this the right Sarah?" problem,
    and it is what a mention resolves against (§C.3). Sereus intends eventually to group a user's
    strands across sApps by that private name — every strand with "Bobaroo", chat or otherwise —
    which is the seed of crossing from a chat strand to a tally with the same person. Not required
    now; worth not obstructing. Naming a group strand that has no natural title is still ours.

11. **Alerts is an orphan screen.** `apps/mobile/src/screens/Alerts.tsx` is coded and routed
    (`AppNavigator.tsx`), with no story, no spec, and no entry in `screens/index.md` — flagged in
    `specs/mobile/STATUS.md`. It realizes the "notifications queue" idea. Write the story or remove
    the screen.

12. **Outstanding invitations are invisible.** 01-first-run.md mints an invitation and moves on. There
    is nowhere in the app to see that you sent three and nobody has answered, or that one expired.
    Keep the *mechanics* (single-use, expiry, revocation) at sereus's level; the story only needs
    to establish that pending invitations are visible, attributable to a strand, and can be
    re-shared or abandoned.

13. **Settings has no story and no screen.** Theme (light/dark is fully implemented per
    `specs/mobile/STATUS.md`), language (`global/i18n.md` exists), notification preferences —
    including per-strand notification level, which groups make necessary rather than nice.

14. ~~**Leaving vs. deleting, and the missing middle.**~~ **Done.** Story 33 is rebuilt on the
    three-level ladder — mute, leave, forget entirely — with blocking removed and each rung stating
    its cost. Whether archiving survives as a fourth, cosmetic act is the story's one Open item.

15. **Presence / typing.** `components/index.md` already specifies a Badge with "success for
    online". No story. Sereus-adjacent, but the presentation question is ours.

---

## D. Proposed structure

Renumbered with gaps, grouped by theme. The Source column is provenance only — the former
filenames no longer exist (see [index.md](index.md)).

Renumbered with gaps, grouped by theme. **20 stories** — 11 descended from the original nine
(two of which split in two), 9 genuinely new. **Done:** files renumbered, splits made, stubs written.

[`theory.md`](theory.md) sits alongside them, on the taleus precedent — plain language on what is
wrong with host-based messaging and what a strand is, which the numbered stories then assume.
**Drafted.** It covers, by requirement: there is no directory to be found in; unsolicited contact
is structurally absent rather than filtered; group membership does not expose you to DMs; and every
strand carries an agreement that may include confidentiality and enforcement. It nods to sereus
without re-explaining it. Excluded from the index, like taleus's.

### 01–05 Getting connected
| # | Story | Source |
|---|-------|--------|
| 01 | First run | revise `discovery.md` (first-launch half) |
| 02 | Start a strand | revise `discovery.md` (invite half); fixed-vs-growable, framed as who may ever read this |
| 03 | Respond to an invitation | revise `responding.md` (acceptance half) |
| 04 | Our first conversation | **new** — split from `responding.md`'s tail; first send/receive |
| 05 | Add someone to a strand | **new** — growing a strand; refused by contract, or by permission (C.6) |

### 10–13 Everyday messaging
| # | Story | Source |
|---|-------|--------|
| 10 | Catching up | **new** — unread triage, mentions, dividers, timestamps (C.1, C.9) |
| 11 | Writing a message | **new** — drafts, multi-line, links, failed send, retry (C.2) |
| 12 | Replying and mentioning | **new** — quote-reply, `@`-mentions, reactions (C.3, C.4) |
| 13 | Correcting a message | revise `editing-messages.md`, honestly (B) |

### 20–22 Media
| # | Story | Source |
|---|-------|--------|
| 20 | Sending media | revise `sending-media.md` (trim, add Variants) |
| 21 | Receiving media | **new** — viewer, save, conversation gallery (C.7) |
| 22 | Forwarding a message | **new** — cross-strand, attribution, re-sharing (C.8) |

### 30–33 Strands and housekeeping
| # | Story | Source |
|---|-------|--------|
| 30 | My strands | revise `managing-connections.md`; reframed from contacts to strands |
| 31 | Who's in this strand | **new** — members, managers, joining, leaving; history is whole-strand (C.5) |
| 32 | Finding something | revise `searching-messages.md`, reconciled with the domain contract |
| 33 | Managing a strand | revise `deleting-channels.md`; **leaving**, not deleting, + mute (C.14) |

### 40–42 Me and my app
| # | Story | Source |
|---|-------|--------|
| 40 | My profile | revise `profile-management.md`; broadened, incl. what a group sees |
| 41 | Settings | **new** — theme, language, per-strand notifications (C.13) |
| 42 | Staying connected | **new**, deliberately brief — what a user perceives of cadre and offline |

### 90 Kept, developed last
| # | Story | Source |
|---|-------|--------|
| 90 | Voice and video call | park `video-call.md`; trim to objective + dependencies |

---

## E. Screen map impact

Assessed against `specs/mobile/navigation.md` and `specs/mobile/screens/index.md`. Group support
adds one screen and changes the *meaning* of the root screen; most other work is depth on screens
that already exist.

### Likely new screens

| Screen | Driven by | Note |
|--------|-----------|------|
| **StrandDetail** | 30, 31, 33 | Member list, managers, whether it can grow, add-member entry, mute, leave, archive. Replaces the never-built "view Sarah's profile details" of 30-my-strands.md Alt D, generalized from a person to a strand. Tapping a member must not imply a private chat *or a direct invitation* — neither exists. There is no "Delete strand" unless you are the last member. |
| **MediaViewer** | 21 | Full-screen attachment view, zoom, swipe, save. `MediaPicker` is only a *source chooser* — it does not cover consumption. |
| **StrandMedia** | 21, 32 | Per-strand media grid, already implied by 32-finding-something.md Alt B. Could be a tab within StrandDetail rather than its own route. |
| **ForwardTo** | 22 | Multi-select strand picker. |
| **Settings** | 41 | Nothing exists. Push from Profile, or promote Profile to sit under it. |
| **Alerts** | C.11 | Already coded and routed; needs story + spec + an entry in `screens/index.md` to stop being an orphan. |

### Existing screens that change

- **ConnectionsList → StrandList.** The rename is the substance, not cosmetics: rows are no longer
  "a person I'm connected to". A row needs a title that may be a group name rather than a partner
  name, an avatar that may represent several people, and a subtitle whose message preview now needs
  a sender prefix. Gains unread triage and mark-unread, a pending-invitations section, an archived
  section (33-managing-a-strand.md already promises archiving with no screen state for it), mute
  indicators, and mention badges distinct from plain unread. Its header "Add Friends" button is
  contact-language and needs the same terminology pass as `navigation.md`'s route titles.
- **ChatInterface** — sender name + avatar on incoming bubbles for groups, header showing member
  count with an entry to StrandDetail, `@`-mention entry and highlighting, quote-reply bar,
  reactions, unread divider, jump-to-latest, date separators and sender grouping, draft
  persistence, failed-send affordance, selection mode for forwarding.
- **InvitationGenerator** — an invitation now belongs to a strand: either a new one (with its
  two-party-vs-growable choice) or an existing one being grown. Also lists outstanding invitations.
- **ProfileSetup** — broadened by 40; unchanged with respect to cadre, which stays a pushed
  component.
- **SearchInterface** — scoping and progressive results once reconciled with "no global index";
  results need a strand label now that a match may come from a group.

### The strand status indicator

Public and private-managed are not two settings but two different worlds, and settling a private
strand produces a third. There is no such thing as a managed public strand, so this is **one
three-valued status, not two flags**:

| State | Who can join | Who can remove | What a member can count on |
|-------|--------------|----------------|----------------------------|
| **Public** | anyone holding the link | nobody | nothing about who reads it — but nobody can put them out |
| **Private, managed** | whoever a manager invites | any manager, including other managers | nothing; they are here at somebody's discretion |
| **Private, settled** | nobody | nobody | everything — who is here is who will ever be here |

Read down the last column and the trade is plain: public strands offer the safest tenure and no
confidentiality at all; managed strands offer neither guarantee; only a settled strand offers both.
That is what the indicator has to convey, and it is why three states beat a pair of flags.

New, cross-cutting, and load-bearing for the confidentiality story (02, 03, 31). Every strand
carries a visible indication of what it is — private or public, and whether anyone in it can still
add people — which a member can read at a glance and which updates when the strand changes. It has
to appear wherever a member decides whether to say something: the strand list, the strand header,
the strand detail, and the invitation-acceptance screen *before* the user commits.

The indicator must report **recorded state, never inferred state**, because the two look nothing
alike underneath:

- **Resignation is recorded on the strand.** "No manager" is therefore a fact any member can read,
  whoever happens to be online. This is the only thing that produces a verifiably settled strand,
  and it is what the confidentiality story rests on.
- **Abandonment is invisible.** A manager who walks away, or loses their keys, is still recorded as a
  manager. Nobody can tell whether they discarded the key or will reappear next year. The strand
  goes on showing that someone can add people — which is the honest answer, because that is all
  anyone knows.

And there is no notion of a person being *gone* at all: an absence may be an hour or forever, and
nothing can tell the difference, so the app should not offer a word for it. Resignation records only
that somebody is no longer a manager — they remain an ordinary member.

So the indicator must never soften a managed strand into a settled one on the strength of
inactivity. A strand whose only manager has vanished reads as it truly is: still able to grow, by
someone who may never come back.

Note that "managed" now carries **two** consequences for a member, not one: the strand can gain
people who will read everything, and the member can be put out of it. A settled strand is fixed in
both directions. The indicator is therefore telling a member about their confidentiality *and* their
tenure, and both belong in how it reads.

### Component impact

`components/index.md` mostly anticipated this. The **strand status indicator** above is a new
component, and the one most likely to need its own spec file, since its states carry meaning rather
than decoration. **MessageBubble** already reserves an "optional sender name (group)". **Avatar**
does not — it needs a group form (composite or named), and the
name→color hash needs to behave for strand titles as well as people. **Badge** needs a mention
state distinct from unread count.

### Unchanged

Navigation stays single-stack; no tabs implied. `QrScanner`, `InvitationAcceptance` and the
deep-link scheme are untouched. `CadreManager` stays exactly as it is — a pushed,
component-provided screen. `VideoCallActive` / `VoiceCallOverlay` remain index-only until story 90.

**Net:** 6 new screens, of which one (Alerts) already exists in code and one (StrandMedia) may fold
into StrandDetail. The larger change is that the root screen stops being a contact list.

---

## F. Domain contract impact

Group support breaks one thing outright, which should be fixed before stories are drafted against it.

- [ ] **`ops.md` `Strands.list()` assumes exactly one partner.** It returns `displayName: partner's
      name` and `avatarUrl: partner's avatar`. For N parties this needs a strand title (explicit
      name, or derived from members) and a member set. `listMessages` likewise needs sender
      identity resolvable to a display name, which today the UI infers from "the other person".
- [ ] **`schema.md` has no strand-level metadata** — no title, no kind (fixed-two vs. growable), no
      role. `Member` is correctly an N-row table, which is the part that already works. Open
      boundary question: a strand's *title* is probably chat's data, while its *permissions and
      contract* are sereus's. Worth confirming before either is modeled.
- [ ] **`overview.md`** already says "2–N parties" — no change needed, and it is the reason the
      restructure is cheap.
- [ ] **Do not model per-member history visibility.** A member holds the strand database, so
      history is whole-strand by construction. Nothing in schema, ops or the UI should imply
      otherwise; confidentiality is bounded by the contract at creation, not by read filters.
- [ ] **Remove `Message.Status` from `schema.md`**, and make sure nothing in `ops.md` or the UI
      reports delivery or read state. The only distinction the app draws is whether a message has
      left the device.
- [ ] **Delete is supported — say so.** `Message` and `Attachment` rows can be deleted and the
      deletion propagates. Neither `ops.md` (no delete operation) nor `schema.md` records this.
      Specify it as removal from the table, with no claim about copies held elsewhere.
- [x] ~~Decide whether edit retains prior versions.~~ — **no history; edit in place.** The schema
      needs no version chain, and story 13 no longer offers to show an earlier version.
- [ ] **There is no "delete strand" operation** except for a last remaining member; leaving is the
      primitive (Appendix). `ops.md` should carry leave, not delete, and the UI must not offer one
      member a control that would act on everyone.
- [ ] **A stranded strand still works.** No new members or managers can be added once the last
      manager is gone, but messaging continues. If that state is ever surfaced, it is a note, not
      an error — and it may not be worth surfacing at all.

---

## G. Open decisions

- [x] ~~Group strands~~ — **supported from inception.** Permission structure comes from sereus:
      *n* managers per private strand, a manager may grant invite rights (Appendix). Stories show a
      user meeting these rules; they do not define them.
- [x] ~~Forwarding~~ — **in scope**, story 22.
- [x] ~~Reply vs. threading~~ — **quote-reply plus `@`-mentions**; threading out of scope. Groups
      make quote-reply necessary and threading a different screen model than we want.
- [x] ~~Does a new member see history from before they joined?~~ — **yes**, and it is not a
      setting. Joining a strand means holding its database. This is exactly why the contract
      matters: committing up front to two parties forever is the only way either party can know
      the audience will not widen. Stories say this once where the choice is made; no per-member
      scoping is to be designed or implied.
- [x] ~~Whose messages may I delete?~~ — **my own content only**, with **no time limit**. No member,
      manager included, has moderation reach over anyone else's messages. Story 13 is revised
      accordingly.
- [x] ~~What is left behind by an edit or a delete?~~ — **nothing.** Edits happen in place with no
      history; a deleted message leaves no tombstone or "message deleted" marker. The app does not
      track whether anyone saw the original — instead, removing an attachment tells the user plainly
      that copies already seen cannot be reached.
- [x] ~~What happens if the owner deletes the whole strand?~~ — **answered upstream; the premise
      was wrong.** There is no owner, and a strand cannot be deleted at all unless you are its last
      member — you *leave* it. If the last manager leaves or loses their keys the strand becomes
      **stranded**: no new members or managers can be added, but everyone still in it carries on
      using it normally. Milder than we assumed — not inoperable. See the Appendix.
      Corrects stories 31 and 33 and the §F contract items.
- [x] ~~Is "just us two, forever" a declared property, visible at formation?~~ — **it is achieved,
      not declared**, by every manager giving up the ability. Briefly reopened by the source review,
      which found the last manager cannot currently resign (`MinOneManager`); the capability is
      confirmed as coming, so the design stands. Re-check the *verifiability* of zero managers when
      it lands — that is the part our stories lean on. There is no size setting. A strand is private or public at creation; a manager
      may invite at any time; each invitation says whether its holder also becomes a manager; and a
      manager may resign. "Just us two, forever" is: create, invite one non-manager, resign. With
      nobody holding manager rights the strand can never grow. theory.md's claim survives, but the
      mechanism is different from what was written — see the two open items below.
- [x] ~~How is that expressed to a user who has never heard of a manager?~~ — **through a visible,
      live status on the strand itself.** Every strand shows what it is: private or public, and
      whether anyone in it can still add people. It is inspectable before accepting an invitation
      and at any time after, and it changes when the strand changes. The mechanism is not hidden —
      it is made legible, so a member can *see* the difference rather than trust a claim about it.
- [x] ~~Are read receipts wanted?~~ — **no, and the column goes.** No delivered or read state is
      tracked. A reply is the evidence a message was read. The app distinguishes only whether a
      message has left the device.
- [x] ~~Should a mute let mentions through?~~ — **the user chooses.** Muting comes in two flavors:
      quiet unless somebody names you, or quiet regardless. Both honor the instruction, because the
      user gave it. Stories 10 and 33 carry it.
- [x] ~~Resign before or after the invitation is taken up?~~ — **neither; resignation is manual and
      can happen at any time.** It is not bound to invitation processing and is never automatic.
      Either party may prompt it: an invitee can ask the inviter to close the strand before saying
      anything sensitive, and an inviter can do it proactively. This is a known training hurdle and
      is accepted rather than designed around.
- [x] ~~Does blocking exist?~~ — **no.** Leaving is what stops messages arriving; muting is what
      stops notifications. Story 33 no longer offers blocking.
- [x] ~~Undo on leaving?~~ — **superseded by a three-level model.** Mute (still participating, no
      notifications) → leave (cadre stops participating, identity kept, return possible) → forget
      entirely (identity and data discarded, permanent, a later return is as a new member). Story 33
      is built on this ladder. No undo is offered, because each rung states its cost up front.
- [x] ~~Should an invitation survive app installation?~~ — **no.** Deferred deep linking would mean
      a third-party attribution service, and no third party is being introduced. The second scan
      stands as a deliberate cost.
- [x] ~~User-facing vocabulary~~ — **"strand", user-facing included**, on the condition that the
      stories make it intuitive rather than assuming it (§A). One word across app, stories and
      specs, which also propagates the sereus vocabulary instead of translating it away.

### Findings from reading the sereus source (2026-09-01)

Reviewed `ser/sereus` at `Optimystic & Quereus upgrade` (2026-08-31): `docs/`, `schemas/*.qsql`,
`packages/cadre-core`, `tickets/`. Evidence order: schema and implementation over prose docs.
`packages/strand-proto` is deprecated and stale — ignore it.

#### Confirmed as roadmap, not blockers

Two of the findings below were checked with the maintainer and are **coming**, though absent from
the current source. We are designing chat around the platform as intended, not as it stands today,
so the stories that depend on them **stand as written**:

- **Zero managers as a deliberate, verifiable state.** The settled strand survives, and with it
  theory.md's central claim, [02](02-start-a-strand.md) Alt A, [05](05-add-someone-to-a-strand.md)
  Alt D, and the three-state indicator in §E.
- **Private nicknames**, and eventually cross-sApp grouping by screen name (§C.10).

The finding below is recorded as it was found, against today's source.

#### The constraint in today's source

**A closed strand can never deliberately reach zero managers.** `schemas/strand.qsql:393-395`
(`Manager.MinOneManager`) rejects any delete leaving no managers — including the sole manager's own
resignation. The last manager cannot resign; managership is a permanent obligation for at least one
person. Zero managers is reachable **only by accident** (see below), and is indistinguishable from
one.

**Resolved as roadmap** (above): the capability is coming, so the settled strand stays in our
design. Worth re-checking when it lands, since the shape of the guarantee — in particular whether an
invitee can *verify* zero managers before joining — is what our stories lean on.

Two further findings compound it:

- **Removal does not actually cut anyone off.** A closed strand's read gate is a single shared
  `MemberPrivateKey` handed to every joiner (`schemas/control.qsql:130-131`). A removed member keeps
  it and keeps everything already replicated; `docs/strands.md:285-288` concedes that rotating the
  gate "currently means re-forming the strand" — new id, new network, no history. So "put the
  stranger out" ([05](05-add-someone-to-a-strand.md) Alt F) has no implementation behind it.
- **A removed member holding an unspent invitation re-admits itself.** Invitations are bearer
  tokens, removal does not cancel them, and no gate checks that the issuer is still a manager
  (`docs/strands.md:302-304`, `schemas/strand.qsql:80-103`).

#### The layer our stories assume is not switched on

The whole `Member`/`Manager`/`Invite` model is implemented and tested but **unused by any production
path**. Every joiner of a closed strand is handed the *founding* member key, so all parties present
the same identity (`tickets/backlog/feat-strand-party-identity.md`;
`packages/reference-app-rn/src/chat-strand.ts:179-198`). Today there is no per-party identity, no
real distinction between a manager and a member, and no sender attribution. `docs/strands.md` reads
as though this were all operative and will mislead anyone who reads it alone.

#### What was confirmed as we assumed

- Any manager can remove any other manager; **no generation gate, nothing privileges the founder**
  (`strand.qsql:340-345, 450-460`).
- A manager can promote an existing member (`addManager`), and can demote without removing.
- A sole manager is unremovable; promoting a second makes the first removable immediately.
- Open strands have **no managers and no members at all** — by schema, `Member`/`Manager`/`Invite`
  are all `OnlyClosed`. No invitations, no removal, no leaving, no rejoining; the concepts do not
  exist. (Stronger than we assumed, and consistent with our story.)
- Invitations are single-use bearer tokens, optionally expiring, cancellable.
- No delivery or read status anywhere — our decision to drop the column matches the platform.
- No per-member history scoping; every member holds everything.
- Strand titles are the app's to own; sereus has no metadata slot for them.

#### What we assumed that is not so

- **An invitation cannot carry manager status.** There is no "join as manager" invite. Manager
  status is conferred only by a live manager signing a promotion, though `admitManager` does
  admit-and-promote in one transaction. Story [02](02-start-a-strand.md) step 3 and
  [05](05-add-someone-to-a-strand.md) need rewording — the *effect* is reachable, the mechanism is
  not what we wrote.
- ~~Private nicknames are not in sereus~~ — **confirmed as roadmap**; not in the current source.
  §C.10 stands.
- **There is no home for private per-user state.** Read position ([10](10-catching-up.md)) would be
  public in an sApp table, and the control DB — which has exactly the right replication, party-wide
  and private — has a **fixed, closed schema with no app-extension table**. Story 10's "the same
  wherever I'm looking from" has nowhere to live.

#### Hazards a chat app inherits

| Issue | Evidence | Bearing on us |
|-------|----------|---------------|
| Zero-manager permanent freeze via partition — `MinOneManager` counts *locally visible* rows, so two partitioned nodes each removing a different manager converge to zero, unrecoverably | `strand.qsql:389-392`, `strands.md:291-297` | The accidental version of the state we *want* deliberately |
| Concurrent same-PK insert silently last-writer-wins, **both writers told they succeeded** | `tickets/blocked/optimystic-concurrent-same-pk-insert-silent-lww.md`, repro verified | Message loss. `chat-simple.qsql` uses client UUIDs to dodge it |
| A block written while only one machine holds it can be unreadable by others | `tickets/blocked/block-held-by-only-one-machine-is-unreadable.md`, verified, still ~1-in-5 as of 2026-08-24 | Two phones, no always-on node = messages can vanish |
| No store-and-forward; sync is pull-on-read | `architecture.md:713` | If both parties are asleep phones, nothing moves. [04](04-our-first-conversation.md) Alt B assumes it eventually arrives |
| No message ordering, no HLC or causal delivery for sApp data; timestamps self-asserted | `chat-simple.qsql`, `cadre-consistency.md` (unimplemented) | Ordering is ours to solve and cannot be solved well |
| Every strand is a separate libp2p node; `realtime` latency hint means never hibernating | `architecture.md:735-750, 724-733` | 50 strands = 50 nodes. Responsiveness and battery are in direct tension |
| No cross-strand search, and most strands hibernate | `architecture.md:690, 735-750` | [32](32-finding-something.md) must wake every strand, not merely iterate |
| Deleting the control `Strand` row destroys the party's only copy of `MemberPrivateKey` | `architecture.md:1433`, `debt-strand-tombstone-reap.md` | [33](33-managing-a-strand.md)'s "forget entirely" needs the same guard `cadre strand remove --yes` has |
| Cross-party strand discovery is unsolved; cohorts today are one party's machines | `strands.md:115-129` | Replication breadth buys machine redundancy, not party redundancy |
| Strand contracts are design-stage, nothing implemented, no ticket | `docs/strand-contracts.md:3` | theory.md's "agreements can carry consequences" has nothing behind it yet |
| No attachment/blob strategy — no chunking, resumability or dedup | no ticket found | [20](20-sending-media.md)/[21](21-receiving-media.md) assume media works |
| `docs/api.md` §§1–2 stale; `push-network.md`, `cadre-consistency.md`, `strand-contracts.md` all design-stage | each says so at the top | Do not treat these as descriptions of what exists |

### Open questions for sereus

Narrowed twice: first by the source review, then by confirming that leaderless strands and private
nicknames are both coming. What remains are things nothing in the source or the roadmap yet covers.

**Filed upstream 2026-09-01** — `gotchoices/sereus` issues
[#3](https://github.com/gotchoices/sereus/issues/3) (MinOneManager local-count floor now that
deliberate rotation to zero is coming, and telling a deliberate seal from an accidental one),
[#4](https://github.com/gotchoices/sereus/issues/4) (what removal actually prevents),
[#5](https://github.com/gotchoices/sereus/issues/5) (is per-collection revision order available to
sApps),
[#6](https://github.com/gotchoices/sereus/issues/6) (no home for party-private per-user state),
[#7](https://github.com/gotchoices/sereus/issues/7) (`schemas/chat.qsql` superseded and broken).
Questions 1–4 below correspond to #4, #6, #5 and the unfiled attachments question.

**Blocking a story we have drafted**

1. **Does removal revoke read access, in the intended design?** Today it cannot — the read gate is a
   single shared member key the removed party keeps, and rotating it means re-forming the strand.
   [05](05-add-someone-to-a-strand.md) Alt F says "nothing further reaches them", which is the
   evident intent of having ejection at all. Does per-member keying arrive with the leaderless work,
   or separately? Related: a removed member holding an unspent bearer invitation currently re-admits
   itself, since removal cancels nothing.
2. **Where does private per-user state live?** Read position ([10](10-catching-up.md)) needs to
   replicate across a party's own devices and be invisible to other members. The control DB has
   exactly those properties and a closed schema; an sApp table has the wrong audience. Nothing else
   fits.
3. **Is message ordering ours to solve?** ([#5](https://github.com/gotchoices/sereus/issues/5).)
   Reframed by a find: Optimystic already totally orders transactions within a collection by commit
   revision, and treats wall-clock timestamps as metadata (`optimystic/docs/correctness.md` §6.3).
   The question is whether that order is reachable from an sApp through Quereus. A placeholder spec
   with both routes is recorded in `specs/domain/schema.md`; **stories stay out of it**.
4. **Is there a plan for attachments?** No chunking, resumability or dedup; media would be rows
   replicated as ordinary blocks. [20](20-sending-media.md) and [21](21-receiving-media.md) assume
   media works.

**Shapes a decision, not blocking**

5. **When does per-party identity land** (`feat-strand-party-identity`)? Until it does there is no
   sender attribution at all, so no group story is testable end to end. Presumably the same wave as
   the leaderless work — worth confirming they ship together.
6. **Are strand contracts on the roadmap?** Design-stage, no ticket. theory.md says agreements can
   carry consequences; nothing backs that yet.
7. **Can a removed member be told they were removed?** Still uncontemplated, and entangled with
   question 1.
8. **Is cross-party strand discovery coming?** Cohorts today are one party's machines, so
   replication breadth buys machine redundancy and no party redundancy — which is what
   [04](04-our-first-conversation.md) Alt B and [42](42-staying-connected.md) quietly rely on.

**Known and accepted for now**

Reliability hazards from the review — silent last-writer-wins on concurrent same-PK inserts,
single-holder blocks that can be unreadable, no store-and-forward — are platform defects with
verified repros rather than design questions. They do not change any story. They do mean the app
cannot be trusted end to end until they clear, and they strengthen the case
[42](42-staying-connected.md) makes for a party having something always on.

## H. Explicitly not in scope

Recorded so they read as decisions rather than gaps:

- Cadre composition, node types, key custody, backup, recovery ceremonies — **sereus's** to design.
  Story 42 covers only the perceived effect.
- Strand permission model, manager rights, and strand agreements — **sereus's**. Stories show what
  a user encounters ("this conversation can't take more people", "you're not a manager"), never the
  rule that produced it.
- History scoping or per-member message visibility — not a feature, and not a gap. History follows
  the database; the contract is what bounds the audience.
- Strand formation protocol, invitation token mechanics, single-use and expiry rules — sereus's.
  Stories state what a user sees when an invitation is spent or stale, not why.
- Replication, delivery guarantees, and cohort behavior — stories may show a user encountering
  "not delivered yet", but must not specify the mechanism.
- Threading, group calling — deferred, and stated as deferrals in index.md.
- Web and desktop targets — `specs/project.md` commits to web (sveltekit, planned), but stories are
  per-target and `design/stories/web/` is a separate future effort.

---

## Appendix: assumptions about sereus strands

What this plan takes as given about strand structure and permissions. Not our design — recorded so
stories stay consistent with it, and so a wrong assumption is visible in one place. Confirmed
upstream except where marked.

- A strand is 2–N parties, backed by a replicated database. Being a member means holding it.
- A private strand has **no owner**. It has *n* **managers**.
- A manager may grant permission to invite members and managers, including to an **existing** member
  (promotion), not only to someone being invited.
- A manager can **remove** members from a strand, **including other managers**. Managers are
  symmetric: nothing privileges the creator, and any two managers can each remove the other. Removal
  stops anything further reaching that member; it does not reach what they already hold.
- **A public strand has no managers at all.** Nobody can be invited, because anyone holding the link
  may join, and nobody can be removed, because nobody holds the ability. It is open in both
  directions and nobody is in charge of it.
- A strand cannot be deleted, only left, unless you are its last member.
- Leaving is always available; the strand continues without you. Nothing happens at the strand
  level when you leave — your cadre simply stops taking part, on your instruction.
- Keeping the key that identifies you in a strand lets you return as the same member later.
  Discarding it is permanent: a later return is as a new member, and your earlier messages stay
  attributed to who you were.
- A strand is public (anyone with the link may join) or private (only invitees).
- There is **no maximum-member setting**. Membership is bounded only by whether a manager exists.
- A manager may invite anyone at any time, and each invitation decides whether its holder becomes a
  manager too.
- A manager may **resign**, at any time, as a manual act. It is never automatic and is not bound to
  invitation processing. Resignation is **recorded on the strand**, so any member can see that a
  strand has no manager, whoever is currently online. It is irreversible.
- **Abandonment is not resignation.** A manager who stops participating, or loses their keys, remains
  recorded as a manager. Nothing distinguishes that from a manager who is merely quiet, and nothing
  can — so a strand in that state still shows that it can grow.
- Resignation removes the *role*, not the person: a resigned manager stays an ordinary member. There
  is no recorded notion of anyone being gone, temporarily or permanently.
- Private nicknames for strand partners are provided by sereus; the named partner need not know.
  Grouping a user's strands across sApps by that private name is intended but not yet available.
- So a permanently two-party strand is made, not declared: create, invite one non-manager, resign.
  Inviting three and then resigning fixes the strand at four. Resignation can happen before or
  after an invitation is taken up.
- If the last manager leaves or loses their keys the strand is **stranded** — no new members or
  managers can be added — but everyone still in it keeps using it normally.
- A new member holds the whole history, including what was said before they joined.
- Deleting a row removes it from the strand database and propagates to every member. It has no
  reach over copies cached or backed up elsewhere.
- A strand carries a member's display identity, not a route to them. No address, no directory, no
  lookup, and generally no way to invite a fellow member directly.
- A strand's agreement may carry confidentiality terms, and may carry enforcement.
- Public strands are a separate case — open join and leave, nothing to administer. Out of scope
  this round.
- **Unconfirmed:** whether permanence ("just us two, forever") is a property members can *see* at
  formation, or merely the result of nobody holding invite rights. theory.md assumes the former;
  tracked in §G.
