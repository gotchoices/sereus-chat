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

Every story is **drafted, none reviewed**. The previous version of this file marked all nine
"Completed", which overstated things — they were written before the sereus vocabulary landed and
have not been reconciled with it. None of them contemplate a strand with more than two people.

| Story | State | Verdict |
|-------|-------|---------|
| [discovery.md](discovery.md) | drafted | Solid narrative; keep, renumber, fix step numbering |
| [responding.md](responding.md) | drafted | Best story in the set; split — its tail is a separate story |
| [managing-connections.md](managing-connections.md) | drafted | Reframe: it is a *strand* list, not a contact list |
| [sending-media.md](sending-media.md) | drafted | Good breadth; needs a receiving counterpart |
| [searching-messages.md](searching-messages.md) | drafted | Keep; reconcile with "no global index" |
| [editing-messages.md](editing-messages.md) | drafted | Over-promises mutability; needs honest rewrite |
| [deleting-channels.md](deleting-channels.md) | drafted | Same over-promise; add leave/mute for groups |
| [video-call.md](video-call.md) | drafted | Over-specified for a deferred feature; trim and park |
| [profile-management.md](profile-management.md) | drafted | Off-template; too narrow (photo only) |

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

- [ ] **Number the files.** `agent-rules/stories.md` states the rule plainly: "Stories: numbered for
      order (`01-browsing.md`)". We use unnumbered kebab-case and carry ordering in index.md
      instead. Adopt gapped numbering (see §D) so stories can be inserted without renaming.
- [ ] **Add a `## Variants` section to every story** (`happy` / `empty` / `error`). No story has one.
      The template requires it and appeus's scenario lane consumes it, so its absence blocks
      downstream generation.
- [ ] **Normalize section headings** to the template: `## Story Overview`, `## Sequence`,
      `## Acceptance Criteria`. We currently use `## Primary Sequence Path`, and
      profile-management.md is off-template entirely (`# Story:`, `## Context / Triggers`,
      `## Sequence (Primary)`, `## Alternative Paths`).
- [ ] **Drop bracketed titles.** `# User Story: [Discovery]` → `# User Story: Discovery`.
- [ ] **Normalize the As-a/I-want/So-that block** to the template's plain form; drop the `**As a**`
      bolding and trailing commas.
- [ ] **Make alternative-path numbering mean something.** The template distinguishes dotted
      sub-steps (return to the next main step) from renumbered main steps (replace a segment). We
      mix both without signalling which, and several paths never state where they rejoin.
      sending-media.md Alt B ends "Continue to 6" but its own step 6 is a different action.
- [ ] **Fix discovery.md's skipped step** — the primary sequence runs 3 → 5.
- [ ] **Adopt "strand" as the user-facing word**, replacing "connection", "channel" and "chat",
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
- [ ] **Rewrite index.md** to carry grouping and *deliberate deferrals*, not just an ordered list.
      Add `theory.md` to its excluded-files line alongside `AGENTS.md`, `README.md` and `STATUS.md`.

### Conventions worth adopting from taleus

Not required by the template, but they have earned their place in
`ser/taleus/packages/taleus-app/design/stories/mobile/`:

- [ ] **`## Roles` table.** Previously suggested for two-party stories; with groups it matters more,
      because a story now has a manager, a member who may invite, and a member who may not.
- [ ] **`## Open` section** naming known-unknowns and pointing at the ticket or upstream decision
      that settles them. This is exactly where "waiting on sereus" belongs, per story.
- [ ] **State + reason tracking in this file** (`revised — dropped X because Y`) rather than a
      checkbox.

---

## B. Corrections to existing content

Concrete defects, worth fixing regardless of the restructure.

- [ ] **Profile disclosure contradiction.** managing-connections.md Alt D says Bob "sees the profile
      information Sarah shared (name, email)". `specs/domain/schema.md` shares only `Name` and
      `AvatarUri` via `Member`; email/phone/notes are device-local and never leave the device.
      Either the schema grows a disclosure model or the story loses the claim. **Recommend the
      latter** — and solve the real need (telling two Sarahs apart) with local nicknames (§C.10).
      Groups sharpen this: in a group my name and avatar are visible to people I never invited.
- [ ] **Search performance contradiction.** searching-messages.md requires search that is "fast and
      responsive even with extensive conversation history"; `specs/domain/interfaces.md` says search
      iterates attached strand DBs with "no global index", and cold strands fault in on demand. The
      story needs to acknowledge a progressive/scoped search, or the domain contract needs an index.
- [ ] **Edit and delete: the operation is sound, the reassurance is not.** Delete is an ordinary
      table mutation — removing a `Message` or `Attachment` row propagates as shared strand state
      and every member's app stops showing it. So editing-messages.md Alt B (removing a photo from
      a sent message) is implementable as written. What must be rewritten is the promise around it:
      in a distributed world a node may have cached or backed the content up, and we have no reach
      over that. Prefer "removed from the conversation" to "deleted"; never offer a permanence we
      cannot deliver. A growable strand adds a second reason not to sell deletion as containment —
      the audience for anything already said can widen after the fact. A member may delete only
      their own content; there is no moderation reach over anyone else's messages.
- [ ] **Deleting a strand is a different act from deleting a message**, and deleting-channels.md
      blurs three things: leaving a strand, discarding my local copy, and removing content for
      every member. Its "all messages deleted from his device" is a local act and unproblematic;
      its brief Undo is implementable as a re-insert, but should be specified rather than assumed.
- [ ] **`Status: sent/delivered/read`** exists as a column in schema.md with no story behind it.
      In a group, "delivered" and "read" are per-member, not per-message. Either write the story
      (§C.3) or drop the column.
- [ ] **video-call.md is over-specified** for something we're deferring — mid-call video upgrade and
      screen sharing are asserted as free. Trim to the objective and mark the dependencies. Note
      that group calling is a further question, not assumed.

---

## C. Story holes to fill

Ordered by how much they hurt. All are ordinary chat UX; none require deciding anything about
sereus internals.

1. **Receiving and catching up — no story exists.** Every current story is authored from the
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

4. **Reactions.** responding.md step 7.3 mentions emoji in passing; sending-media.md has Mike
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

6. **Adding someone to an existing strand.** Distinct flow from starting a new one, and the point
   where the user meets the strand's own limits. Two refusal shapes are worth showing, since they
   are how the contract becomes visible without our explaining it: the strand itself does not allow
   growth ("this conversation was set up for two"), and the member is not permitted to grow it
   (they are not a manager). Also the moment where an invitation is scoped to a strand rather than
   to a person, and where the user should understand that whoever joins can read what was already
   said.

7. **Receiving media.** Sending is covered in six alternative paths; receiving is one line ("Mike
   plays the video"). Nothing on full-screen viewing, zoom, swiping between images in a
   conversation, saving to the camera roll, or a per-conversation media gallery — the last of which
   searching-messages.md Alt B already gestures at.

8. **Forwarding between strands.** Confirmed in scope. Pick a message, choose one or more other
   strands, send it on — with the question of whether the original sender is attributed, and what
   the user is told about re-sharing something from a private conversation.

9. **Message presentation.** Date separators, grouping consecutive messages from one sender,
   relative vs. absolute timestamps, and scroll-position restore are unspecified anywhere in the
   design. Groups add sender names and avatars on incoming bubbles — already anticipated by
   `components/index.md` ("optional sender name (group)") but never storied.

10. **Local nicknames.** Susan calls herself "Su-Z". Can Bob file her as "Susan (work)"? Purely
    local, no disclosure implications, and it's the honest fix for managing-connections.md's "is
    this the right Sarah?" problem. Extends to naming a group strand that has no natural title.

11. **Alerts is an orphan screen.** `apps/mobile/src/screens/Alerts.tsx` is coded and routed
    (`AppNavigator.tsx`), with no story, no spec, and no entry in `screens/index.md` — flagged in
    `specs/mobile/STATUS.md`. It realizes the "notifications queue" idea. Write the story or remove
    the screen.

12. **Outstanding invitations are invisible.** discovery.md mints an invitation and moves on. There
    is nowhere in the app to see that you sent three and nobody has answered, or that one expired.
    Keep the *mechanics* (single-use, expiry, revocation) at sereus's level; the story only needs
    to establish that pending invitations are visible, attributable to a strand, and can be
    re-shared or abandoned.

13. **Settings has no story and no screen.** Theme (light/dark is fully implemented per
    `specs/mobile/STATUS.md`), language (`global/i18n.md` exists), notification preferences —
    including per-strand notification level, which groups make necessary rather than nice.

14. **Leaving vs. deleting, and the missing middle.** deleting-channels.md is built on an act
    that does not exist: a strand cannot be deleted unless you are its last member — you **leave**
    it, and it carries on without you. So story 33's primitive is leaving, plus discarding my local
    copy, plus archiving; and *muting*, the everyday middle ground a busy group demands, is absent
    from a set that currently offers only delete, archive and block.

15. **Presence / typing.** `components/index.md` already specifies a Badge with "success for
    online". No story. Sereus-adjacent, but the presentation question is ours.

---

## D. Proposed structure

Renumbered with gaps, grouped by theme. **9 revised, 11 new, 1 parked — 21 stories.**

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
| **StrandDetail** | 30, 31, 33 | Member list, managers, whether it can grow, add-member entry, mute, leave, archive. Replaces the never-built "view Sarah's profile details" of managing-connections.md Alt D, generalized from a person to a strand. Tapping a member must not imply a private chat *or a direct invitation* — neither exists. There is no "Delete strand" unless you are the last member. |
| **MediaViewer** | 21 | Full-screen attachment view, zoom, swipe, save. `MediaPicker` is only a *source chooser* — it does not cover consumption. |
| **StrandMedia** | 21, 32 | Per-strand media grid, already implied by searching-messages.md Alt B. Could be a tab within StrandDetail rather than its own route. |
| **ForwardTo** | 22 | Multi-select strand picker. |
| **Settings** | 41 | Nothing exists. Push from Profile, or promote Profile to sit under it. |
| **Alerts** | C.11 | Already coded and routed; needs story + spec + an entry in `screens/index.md` to stop being an orphan. |

### Existing screens that change

- **ConnectionsList → StrandList.** The rename is the substance, not cosmetics: rows are no longer
  "a person I'm connected to". A row needs a title that may be a group name rather than a partner
  name, an avatar that may represent several people, and a subtitle whose message preview now needs
  a sender prefix. Gains unread triage and mark-unread, a pending-invitations section, an archived
  section (deleting-channels.md already promises archiving with no screen state for it), mute
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

### Component impact

`components/index.md` mostly anticipated this. **MessageBubble** already reserves an "optional
sender name (group)". **Avatar** does not — it needs a group form (composite or named), and the
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
- [ ] **Delete is supported — say so.** `Message` and `Attachment` rows can be deleted and the
      deletion propagates. Neither `ops.md` (no delete operation) nor `schema.md` records this.
      Specify it as removal from the table, with no claim about copies held elsewhere.
- [ ] **Decide whether edit retains prior versions.** editing-messages.md Alt F has a user reading
      the original alongside the edit. Whether that is possible is a schema choice — a version
      chain versus overwrite in place — and it should be settled before story 13 is drafted.
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
- [x] ~~Whose messages may I delete?~~ — **my own content only.** No member, manager included, has
      moderation reach over anyone else's messages. Affects stories 13 and 33.
- [x] ~~What happens if the owner deletes the whole strand?~~ — **answered upstream; the premise
      was wrong.** There is no owner, and a strand cannot be deleted at all unless you are its last
      member — you *leave* it. If the last manager leaves or loses their keys the strand becomes
      **stranded**: no new members or managers can be added, but everyone still in it carries on
      using it normally. Milder than we assumed — not inoperable. See the Appendix.
      Corrects stories 31 and 33 and the §F contract items.
- [ ] **Is "just us two, forever" a declared property, visible at formation?** The manager model
      supplies the *mechanism* (nobody holds invite rights), but the upstream answer did not
      confirm that members can *see* a strand is permanently two-party when they join. This is
      load-bearing: theory.md's central claim — "you know today who will ever read this" — depends
      on it. Worth a github issue before stories 02 and 03 are drafted.
- [x] ~~User-facing vocabulary~~ — **"strand", user-facing included**, on the condition that the
      stories make it intuitive rather than assuming it (§A). One word across app, stories and
      specs, which also propagates the sereus vocabulary instead of translating it away.

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
- A manager may grant permission to invite members and managers. That is the whole permission model.
- A strand cannot be deleted, only left, unless you are its last member.
- Leaving is always available; the strand continues without you.
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
