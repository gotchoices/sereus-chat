// Sereus adapter — talks to the live cadre stack (CadreNode → strand Quereus DB).
// See design/specs/domain/interfaces.md for the operation→sereus mapping
// and design/specs/domain/sereus.md for the integration boundary.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataAdapter } from '../adapter';
import type {
  Profile, StrandSummary, StrandState, Member, Message, Attachment,
  SearchBatch, SearchOptions, Invitation, InvitationPreview, Visibility,
  Prefs, StorageUsage, SendInput,
} from '../types';
import { INVITATION_VALIDITY } from '../types';
import {
  getAllStrandPrefs,
  setStrandMuted as setStrandMutedLocal,
  setStrandArchived as setStrandArchivedLocal,
} from '../strand-prefs';
import { readStrandSummaries, saveStrandSummaries } from '../strand-summary-cache';
import { attachAndAwaitWritable, attachJoinedStrands, ensureCadreUp, generateUuid, getBootFailure, hasSweptForStrands, watchDiscoveredStrands, leaveStrandLocally, registerSelfAsMember, rememberJoinedStrand, syncProfileNameToStrands } from '../chat-strand';
import { createChatStrand, joinChatStrand } from '../chat-sapp';
import type { StrandInstance } from '@serfab/cadre-core';
import { FormationPostApprovalError, FormationRejectedError, FormationUnreachableError } from '@serfab/cadre-core';
import {
  queryMessages, insertMessage, updateMessage, removeMessage,
  addReaction, removeReaction, queryReactions, queryAttachments, queryMembers,
  insertAttachments,
} from '../chat-operations';
import { UnreachableError } from '../errors';
import { buildInviteUrl } from '../inviteLink';
import { rememberOutgoingInvitation, forgetOutgoingInvitation, listOutgoingInvitations } from '../outgoing-invitations';
import { CHAT_SAPP_ID } from '../chat-sapp';
import { cadreService } from '../../cadre';
import { withTimeout, CONTROL_OP_TIMEOUT_MS } from '../../cadre/async';

const PROFILE_KEY = '@sereus.chat/profile';
const PREFS_KEY = '@sereus.chat/prefs';

const DEFAULT_PREFS: Prefs = {
  theme: 'system', language: 'en', notifyDefault: 'all',
  storageCeilingBytes: null, perStrandOverrides: 0, relayAddrs: [],
};

/** How long the strand list waits on one strand's preview or member read before using its cached row. */
const LIST_READ_MS = 3000;
/** Strands whose list reads are still running (see `listStrands`). */
const listReadsInFlight = new Set<string>();

/** How long an invitation stays good when the caller does not say: story 02's private-strand default. */
const INVITE_EXPIRY_MS = INVITATION_VALIDITY.week;

/**
 * Dev-only step timings for the message path, tagged `[perf]`. Messages took
 * minutes between two phones while the same exchange takes under a second in
 * Node (test/stack/message-latency.mjs); these say which step holds the time.
 */
const perf = (...a: unknown[]) => { if (__DEV__) console.info('[perf]', ...a); };
const seenMessageIds = new Map<string, Set<string>>();

/**
 * Retry a strand write that failed only because this node has just restarted.
 *
 * Sereus 1.9 notes: "A node that restarts while every other member of a strand is
 * offline now remembers them, so its first writes to that strand can fail for a few
 * seconds (`Failed to get super-majority`) until it finds them unreachable. Retry
 * the write." A failed super-majority committed nothing, so retrying cannot
 * duplicate the message. Any other error, or the same one after ~12 s, is the
 * caller's to report — the draft is kept.
 */
async function retryAfterRestart<T>(write: () => Promise<T>): Promise<T> {
  const attempts = 5;
  for (let i = 1; ; i++) {
    try {
      return await write();
    } catch (e) {
      const transient = /Failed to get super-majority/i.test(e instanceof Error ? e.message : String(e));
      perf('write attempt', i, 'failed:', e instanceof Error ? e.message : String(e));
      if (!transient || i >= attempts) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

/**
 * A join failure in words the person can act on. Since sereus 1.10 `formStrand` throws
 * typed errors: `FormationRejectedError` with a fixed `code` and a `retryable` flag
 * when the inviter answered no, and `FormationUnreachableError` when nothing answered.
 * The original stays as `cause` for the logs.
 */
function explainJoinFailure(err: unknown): Error {
  let message: string;
  if (err instanceof FormationUnreachableError) {
    message = 'Could not reach the person who invited you. Their app may be closed or offline — try again when they are back.';
  } else if (err instanceof FormationRejectedError) {
    switch (err.code) {
      case 'token-spent':
        message = 'This invitation has already been used or has expired. Ask for a new one.';
        break;
      case 'token-unknown':
        message = 'The invitation is not ready on their side yet. Try again in a moment.';
        break;
      case 'approval-refused':
        message = 'The person who invited you did not let this join go through.';
        break;
      case 'busy':
      case 'provisioning-timeout':
      case 'host-strand-unavailable':
      case 'approval-unavailable':
        message = 'Their side could not finish this join just now. Try again in a moment.';
        break;
      case 'host-strand-must-be-recreated':
        message = 'This conversation was made with an older version and cannot take new members. Ask for a new invitation.';
        break;
      default:
        message = err.retryable
          ? 'The join did not go through this time. Try again in a moment.'
          : 'This invitation cannot be used. Ask for a new one.';
    }
  } else if (err instanceof FormationPostApprovalError) {
    message = 'You were let in, but this phone could not finish setting up the conversation. Ask for a new invitation.';
  } else {
    return err instanceof Error ? err : new Error(String(err));
  }
  const out = new Error(message);
  (out as Error & { cause?: unknown }).cause = err;
  return out;
}

export class SereusAdapter implements DataAdapter {
  private notImplemented(op: string): never {
    throw new Error(
      `SereusAdapter.${op} not implemented yet — see design/specs/mobile/STATUS.md ` +
        `Final Wiring section.`,
    );
  }

  // ── Step 3: messages on the default strand ────────────────────────────
  // The strandId param is intentionally ignored for now — the mock UI has
  // no way to surface real strand IDs until SereusAdapter.listStrands is
  // wired (step 5).  Until then every chat screen reads/writes the single
  // default strand.

  async listMessages(strandId: string, _opts?: { before?: string; limit?: number }): Promise<Message[]> {
    const t0 = Date.now();
    const strand = await this.strandFor(strandId);
    const [rows, reactions, atts] = await Promise.all([
      queryMessages(strand),
      queryReactions(strand).catch(() => []),
      queryAttachments(strand).catch(() => []),
    ]);
    if (__DEV__) {
      const seen = seenMessageIds.get(strandId);
      const fresh = rows.filter(r => !seen?.has(r.Id));
      if (seen) for (const r of fresh) perf('first seen', r.Content.slice(0, 24), 'sent', r.Timestamp, 'UTC');
      seenMessageIds.set(strandId, new Set(rows.map(r => r.Id)));
      perf('listMessages', rows.length, 'rows in', Date.now() - t0, 'ms');
    }
    const attByMessage = new Map<string, Attachment[]>();
    for (const a of atts) {
      const list = attByMessage.get(a.MessageId) ?? [];
      list.push({
        id: a.Id, messageId: a.MessageId, type: a.Type as Attachment['type'],
        uri: a.Uri, mimeType: a.MimeType, name: a.Name,
        byteSize: a.ByteSize ?? null, durationMs: a.DurationMs ?? null,
        locality: (a.Uri ? 'local' : 'fetching') as Attachment['locality'],
      });
      attByMessage.set(a.MessageId, list);
    }
    const byMessage = new Map<string, Array<{ memberId: string; symbol: string }>>();
    for (const r of reactions) {
      const list = byMessage.get(r.MessageId) ?? [];
      list.push({ memberId: r.MemberId, symbol: r.Symbol });
      byMessage.set(r.MessageId, list);
    }
    // No status is read: none is tracked (design/specs/domain/schema.md).
    return rows.map(r => ({
      id: r.Id,
      memberId: r.MemberId,
      content: r.Content,
      timestamp: r.Timestamp,
      replyToId: r.ReplyToId ?? null,
      editedAt: r.EditedAt ?? null,
      attachments: attByMessage.get(r.Id) ?? [],
      reactions: byMessage.get(r.Id) ?? [],
    }));
  }

  async send(strandId: string, input: SendInput): Promise<Message> {
    const t0 = Date.now();
    let t = t0;
    const step = (name: string) => { const n = Date.now(); perf('send', name, n - t, 'ms'); t = n; };
    const strand = await this.strandFor(strandId);
    step('strandFor');
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');

    // MEMBERSHIP FIRST, because a sender that is not a Member cannot write.
    //
    // `App.Message` declares `foreign key (MemberId) references Member(Id)`, so
    // this device must hold its own `App.Member` row before it can say anything.
    // That row is written by `registerSelfAsMember` on the attach/join/invite
    // paths — and those are the ONLY places it was written. When the write there
    // fails (measured on a phone: `SyncRetryExhaustedError`, because the strand
    // was attached while the only other member was still unreachable), the
    // failure is caught, warned to a console no phone user can read, and NEVER
    // RETRIED. The device is then permanently unable to send in that strand: the
    // insert fails the constraint, the composer restores the draft, and nothing
    // on screen says why.
    //
    // `registerSelfAsMember` is an idempotent upsert, so doing it here costs a
    // no-op on the normal path and repairs the broken one at the only moment
    // that matters — when the user is actually trying to speak, which is also
    // when a cohort is most likely to be available.
    await registerSelfAsMember(strand);
    step('registerSelfAsMember');

    // …and SAY SO if it still did not take. `registerSelfAsMember` swallows its
    // own failure by design (one strand failing must not stop the others during
    // a boot sweep), so without this check a repair that did not work produces
    // the same silent constraint failure as before — the draft reappears and the
    // user is told nothing. Better a sentence they can act on.
    const members = await queryMembers(strand);
    step('queryMembers');
    if (!members.some(m => m.Id === peerId)) {
      throw new Error(
        'Could not register you in this conversation yet — no other member was reachable. ' +
        'Try again in a moment.',
      );
    }

    // A local write.  There is no pending state to surface — the phone holds
    // the strand, so this either lands or genuinely fails.
    const row = await retryAfterRestart(() => insertMessage(strand, peerId, input.content, input.replyToId));
    step('insertMessage');
    const saved = await insertAttachments(strand, row.Id, input.attachments ?? []);
    step('insertAttachments');
    perf('send total', Date.now() - t0, 'ms for', input.content.slice(0, 24));
    return {
      id: row.Id,
      memberId: peerId,
      content: row.Content,
      timestamp: row.Timestamp,
      replyToId: row.ReplyToId ?? null,
      editedAt: null,
      attachments: saved.map(a => ({
        id: a.Id, messageId: a.MessageId, type: a.Type as Attachment['type'],
        uri: a.Uri, mimeType: a.MimeType, name: a.Name,
        byteSize: a.ByteSize ?? null, durationMs: a.DurationMs ?? null,
        locality: (a.Uri ? 'local' : 'fetching') as Attachment['locality'],
      })),
      reactions: [],
    };
  }

  // ── Step 5 (partial): in-memory strand list ──────────────────────────
  // Reads attached strands from `node.getStrands()`.  Today this is just
  // the default chat strand; cross-party strands surfaced via the Control
  // DB will join this list once invitation/formation flow is wired (step 8).

  async setStrandMuted(strandId: string, muted: 'none' | 'soft' | 'hard'): Promise<void> {
    await setStrandMutedLocal(strandId, muted);
  }

  async setStrandArchived(strandId: string, archived: boolean): Promise<void> {
    await setStrandArchivedLocal(strandId, archived);
  }

  async strandsSettling(): Promise<boolean> {
    // A strand with no `database` yet is mid-attach — `listStrands` skips exactly
    // those, so they are the ones that would otherwise read as "no strands".
    // Before the node is even running there is nothing in the map at all, which
    // also counts as settling rather than as an answer.
    // Settled once the node is up AND its first sweep for strands has run. Before
    // that an empty list means "not asked yet"; after it, an empty list is a real
    // answer — and for a new user it is the RIGHT answer, which is story 01's
    // whole point.
    //
    // "Some strand is still opening" would be wrong: it never stops being true if
    // one of them cannot open (an invitation nobody accepted, a host that never
    // answers), so a fault in one row would hide the list forever.
    return !hasSweptForStrands();
  }

  async strandsBootError(): Promise<string | null> {
    return getBootFailure();
  }

  async retryBoot(): Promise<void> {
    // The same sequence App.tsx runs at start, in the same order and for the
    // same reasons: the discovery sweep must be re-armed before anything else
    // touches the node, and remembered joins come last because they are the only
    // step that dials another party.
    await watchDiscoveredStrands();
    await ensureCadreUp();
    await attachJoinedStrands();
  }

  async listStrands(): Promise<StrandSummary[]> {
    // Bring the node up in the BACKGROUND — never block the list on it, so an
    // empty or partial list renders immediately and fills in as strands open.
    void ensureCadreUp().catch(err =>
      console.warn('[SereusAdapter] cadre bring-up deferred:', err instanceof Error ? err.message : err),
    );

    const strands = cadreService.getStrands();
    // One read for the whole list, not one per strand.
    const prefs = await getAllStrandPrefs();
    const cached = await readStrandSummaries();

    // EACH STRAND READ IN PARALLEL, AND BOUNDED. A read can wait on a slow member
    // (Optimystic#25); on the S7 one took 61 s, and the list showed "Looking for your
    // strands…" until every strand had answered. Past LIST_READ_MS a strand's row falls
    // back to what this device last showed for it.
    const rows = await Promise.all([...strands].map(async ([id, strand]): Promise<StrandSummary | null> => {
      if (!strand.database) return null;
      const last = cached[id];
      // A timed-out read keeps running; while it does, do not start another for this
      // strand (the list refreshes every few seconds and they would pile up).
      if (listReadsInFlight.has(id) && last) {
        return { ...last, avatarUri: null, unreadCount: 0, mentioned: false,
          muted: prefs[id]?.muted ?? 'none', draftPreview: null,
          archived: prefs[id]?.archived ?? false, pending: false };
      }
      // Started together; the strand stays "in flight" until both have really
      // settled, not merely until the list stopped waiting for them.
      const messagesRead = queryMessages(strand, 1);
      const membersRead = queryMembers(strand);
      listReadsInFlight.add(id);
      void Promise.allSettled([messagesRead, membersRead]).then(() => listReadsInFlight.delete(id));
      let preview: StrandSummary['lastMessage'] = last?.lastMessage ?? null;
      try {
        const msgs = await withTimeout(messagesRead, LIST_READ_MS, 'last-message preview');
        const newest = msgs[msgs.length - 1];
        preview = newest ? { previewText: newest.Content, senderName: null, timestamp: newest.Timestamp } : null;
      } catch (err) {
        console.warn('[SereusAdapter] last-message preview unavailable for', id, err instanceof Error ? err.message : err);
      }
      // WHO ELSE IS IN IT is the title. `domain/ops.md`: "`title` is the app's,
      // not sereus's — no strand-title slot exists upstream. Two-party strands
      // fall back to the other member's name; unnamed groups compose from member
      // names." There is no screen for naming a strand and there is not meant to
      // be one.
      let members: Awaited<ReturnType<typeof queryMembers>> | null = null;
      try {
        members = await withTimeout(membersRead, LIST_READ_MS, 'member names');
      } catch (err) {
        console.warn('[SereusAdapter] member names unavailable for', id, err instanceof Error ? err.message : err);
      }
      let title: string, isGroup: boolean, memberCount: number;
      if (members) {
        const me = cadreService.peerId ?? '';
        const others = members.filter(m => m.Id !== me);
        const nameOf = (m: { Id: string; Name?: string }) => m.Name?.trim() || m.Id.slice(0, 8);
        // Until the other side's Member row arrives there is nothing truthful to call
        // it — say so rather than invent a name (story 30, path F).
        title = others.length === 0 ? 'Waiting for someone to join'
          : others.length === 1 ? nameOf(others[0])
          : others.map(nameOf).join(', ');
        isGroup = others.length > 1;
        memberCount = Math.max(members.length, 1);
      } else {
        title = last?.title ?? 'Waiting for someone to join';
        isGroup = last?.isGroup ?? false;
        memberCount = last?.memberCount ?? 1;
      }
      return {
        id,
        title,
        avatarUri: null,
        isGroup,
        memberCount,
        lastMessage: preview,
        unreadCount: 0,
        mentioned: false,
        muted: prefs[id]?.muted ?? 'none',
        draftPreview: null,
        archived: prefs[id]?.archived ?? false,
        pending: false,
      };
    }));
    const summaries = rows.filter((r): r is StrandSummary => r !== null);

    // Strands this device knows but has not opened yet, from the last list it showed,
    // so a cold start does not read as "No strands yet" (strand-summary-cache.ts).
    await saveStrandSummaries(summaries);
    const open = new Set(summaries.map(s => s.id));
    for (const known of Object.values(cached)) {
      if (open.has(known.id)) continue;
      summaries.push({
        ...known,
        unreadCount: 0,
        mentioned: false,
        muted: prefs[known.id]?.muted ?? 'none',
        draftPreview: null,
        archived: prefs[known.id]?.archived ?? false,
        pending: false,
        opening: true,
      });
    }
    return summaries;
  }

  // ── Step 5+ ────────────────────────────────────────────────────────────

  /**
   * Streaming search over already-attached strands.  Batched per strand so the
   * UI can render progressively and report what it could not reach — there is
   * no cross-strand index, and hibernating strands are not woken here.
   */
  async *search(query: string, opts?: SearchOptions): AsyncIterable<SearchBatch> {
    void ensureCadreUp().catch(() => {});
    const q = query.trim().toLowerCase();
    const entries = [...cadreService.getStrands()].filter(
      ([id]) => !opts?.strandId || id === opts.strandId,
    );
    const total = entries.length;
    let searched = 0;
    let skipped = 0;

    for (const [id, strand] of entries) {
      if (opts?.signal?.aborted) return;
      searched++;
      if (!strand.database) { skipped++; continue; }
      let results: SearchBatch['results'] = [];
      try {
        const msgs = await queryMessages(strand);
        results = msgs
          .filter(m => q !== '' && m.Content.toLowerCase().includes(q))
          .map(m => {
            const at = m.Content.toLowerCase().indexOf(q);
            return {
              strandId: id,
              strandTitle: `Strand ${id.slice(0, 8)}`,
              messageId: m.Id,
              senderName: m.MemberName ?? m.MemberId.slice(0, 12),
              snippet: m.Content,
              matchRange: [at, at + q.length] as [number, number],
              timestamp: m.Timestamp,
            };
          });
      } catch {
        skipped++;
      }
      yield { results, strandsSearched: searched, strandsTotal: total, strandsSkipped: skipped };
    }
  }

  async getProfile(): Promise<Profile> {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: '' };
    try {
      return JSON.parse(raw) as Profile;
    } catch {
      return { name: '' };
    }
  }

  async saveProfile(profile: Profile): Promise<void> {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    // Best-effort propagation; UI persists regardless of sync result.
    try {
      await syncProfileNameToStrands();
    } catch (err) {
      console.warn('[SereusAdapter] saveProfile name sync failed:', err);
    }
  }

  // ── Invitations ───────────────────────────────────────────────────────

  /**
   * Mint an open invitation to the default chat strand.
   *
   * Prescribed sequence (sereus reference-app-rn `createClosedStrandWithInvite`):
   *   1. `createOpenInvitation(sAppId, expiry)` — mints the out-of-band
   *      envelope only.  Inert on its own.
   *   2. `publishFormationInvite(token, sAppId, { expiresAtMs, strandId })` —
   *      writes the authority-signed `FormationInvite` row that makes the
   *      token redeemable, bound to our existing strand.  Without this the
   *      responder would mint a *fresh* strand on redemption instead of
   *      provisioning ours.
   *   3. `encodeInvitation(...)` — the single base64url code we hand out.
   *
   * The token in the returned `Invitation` is the ENCODED invitation, not the
   * raw `invitation.token`; that's what the invitee feeds to `formStrand`.
   *
   * Expected failure: `createOpenInvitation` throws
   * `'No multiaddrs available for invitation'` on a solo node.  React Native
   * sets `listenAddrs: []`, so this device has no dialable address until it
   * holds a relay reservation via a drone/server in its cadre.  In other
   * words: you must add a node to your cadre before you can invite anyone.
   * That is a real precondition, not a bug — surface it to the user.
   *
   * `publishFormationInvite` is a control-DB write, which blocks indefinitely
   * on a solo node, so it is time-boxed: the caller (InvitationGenerator) gets
   * a prompt, explanatory failure and shows its retry Banner instead of
   * hanging on "Generating…".
   */
  async createInvitation(input: {
    strandId?: string;
    visibility?: Visibility;
    grantsInviteRight: boolean;
    singleUse?: boolean;
    validForMs?: number;
  }): Promise<Invitation> {
    const node = cadreService.cadreNode;
    if (!node) throw new Error('Cadre is not running.');

    // Precondition check FIRST, so a solo device fails instantly with a
    // meaningful message instead of waiting out the strand-attach / control
    // writes.  Without a dialable address there is nothing to put in the
    // invitation's bootstrap list, and no peer could ever reach us.
    if (node.getMultiaddrs().length === 0) {
      // Typed, not a bare Error: story 02 Alt A requires this to be presented as
      // the ordinary starting position with two ways out, never as a failure.
      // The screen distinguishes it by class — see data/errors.ts.
      throw new UnreachableError(
        'There is nowhere for them to answer yet.',
      );
    }

    // WHICH STRAND THIS INVITATION LETS THEM INTO.
    //
    // With a `strandId` the user is inviting someone into a conversation that
    // already exists, and its type was fixed when it was founded — `visibility`
    // is undefined in that case and there is nothing to choose.
    //
    // Without one the screen is "New strand", and the Private/Open choice is the
    // whole point of it. This used to bind every invitation to the default strand
    // and drop `visibility` on the floor, so "Only people you invite can be in
    // it" was a sentence the UI said and the data layer did not implement.
    const strand = input.strandId
      ? await this.attachedStrandById(input.strandId)
      : (await createChatStrand(node, generateUuid(), input.visibility ?? 'private')).instance;

    // THE FOUNDER HAS TO BE A MEMBER OF ITS OWN STRAND, and founding does not make
    // it one. `Message.MemberId` is a foreign key into `App.Member`, so a founder
    // with no row there cannot say anything in the conversation it just started —
    // every send fails the check constraint while the person who JOINED can write
    // freely, because the accept path registers them. Exactly that asymmetry was
    // seen between two devices: the joiner's messages arrived, the founder's were
    // refused, and the founder's own strand listed one member who was the joiner.
    // Idempotent, so inviting a second person into an existing strand re-runs it
    // harmlessly.
    await registerSelfAsMember(strand);

    // THE TERMS (story 02). Sereus enforces both: `totalUses` is counted against the
    // invite's FormationUsage rows and refused as `token-spent` once reached; a null
    // `totalUses` means unlimited until it expires. Omitting it, as this used to,
    // made every invitation usable by anyone holding it for its whole life.
    const singleUse = input.singleUse ?? true;
    const validForMs = input.validForMs ?? INVITE_EXPIRY_MS;
    const invitation = await node.createOpenInvitation(CHAT_SAPP_ID, validForMs);

    await withTimeout(
      node.publishFormationInvite(invitation.token, CHAT_SAPP_ID, {
        expiresAtMs: invitation.expiration.getTime(),
        strandId: strand.strandId,
        ...(singleUse ? { totalUses: 1 } : {}),
      }),
      CONTROL_OP_TIMEOUT_MS,
      'publishFormationInvite',
    );

    const token = node.encodeInvitation(invitation);
    const minted: Invitation = {
      // The RAW token, which is unique. This used to be `token.slice(0, 12)` of the
      // ENCODED invitation, which is the same for every invitation (base64 of
      // `{"token":`), so every invitation shared one id — remembering a second one
      // for a strand silently replaced the first.
      id: invitation.token,
      token,
      // The https App Link, for the QR as well as the text: the person scanning
      // or tapping it may not have the app yet, and a `sereus://` link opens
      // nothing on their phone — story 03 step 2 needs the web page.
      url: buildInviteUrl(token),
      qrPayload: buildInviteUrl(token),
      strandId: strand.strandId,
      expiresAt: invitation.expiration.toISOString(),
      // The platform seats a member from a bearer invitation; invite rights
      // are conferred by a separate signed act (see STATUS.md §G).
      grantsInviteRight: input.grantsInviteRight,
      singleUse,
      spent: false,
      direction: 'outgoing',
    };

    // Kept so it can be listed and shared again after this screen is left — see
    // outgoing-invitations.ts. A failure to remember it must not cost the user
    // the invitation they are looking at.
    const membersAtMint = await queryMembers(strand).then(m => m.length).catch(() => 1);
    await rememberOutgoingInvitation({ ...minted, membersAtMint, createdAt: new Date().toISOString() })
      .catch(err => console.warn('[SereusAdapter] could not remember invitation:', err));

    return minted;
  }

  /**
   * The strand a strand-scoped call is about.
   *
   * Every per-strand read used to ignore its `strandId` and open the default
   * strand instead — a step-3 stub from when the UI had no real strand ids.  The
   * failure it caused is the quiet kind: a joined conversation renders as empty
   * because the query ran against "My Notes", so replication looks broken when it
   * is working.  Resolve here, or not at all.
   *
   * THERE IS NO FALLBACK. Every caller names the strand it means; a missing or
   * unattached id throws rather than quietly opening some other conversation,
   * because a wrong read says nothing and an error says what happened. This used
   * to fall back to the auto-created default strand, which is how a joined
   * conversation came to render as empty while its rows sat in the database.
   */
  private async strandFor(strandId?: string | null): Promise<StrandInstance> {
    if (!strandId) throw new Error('No strand was named.');
    const attached = cadreService.getStrands().get(strandId);
    if (attached) return attached;
    throw new Error(`Strand ${strandId} is not attached on this device.`);
  }

  /**
   * An already-attached strand, by id — for inviting someone into a conversation
   * that exists. Throws rather than silently falling back to the default strand:
   * minting an invitation into the wrong conversation is worse than not minting
   * one, because the mistake is only visible to whoever accepts it.
   */
  private async attachedStrandById(strandId: string): Promise<StrandInstance> {
    const strand = cadreService.getStrands().get(strandId);
    if (!strand) {
      throw new Error(`Strand ${strandId} is not attached on this device.`);
    }
    return strand;
  }

  /**
   * Redeem an encoded invitation.
   *
   * Three steps, and the third is the one that is easy to get wrong: attach the
   * resulting strand with `FormStrandResult.memberPrivateKey`, **not** the
   * invitation's private key.  They are different keys and using the wrong one
   * yields a strand you cannot write to.
   *
   * UNTESTED: `formStrand` performs a consent handshake with the host over
   * libp2p, so it needs a reachable second party and cannot be exercised on one
   * device.  Written from the cadre-core signatures, not from a passing run.
   */
  async acceptInvitation(token: string): Promise<{ strandId: string }> {
    const node = cadreService.cadreNode;
    if (!node) throw new Error('Cadre is not running.');

    const invitation = node.decodeInvitation(token);

    const profile = await this.getProfile().catch(() => ({ name: '' } as Profile));
    // Disclosure is what the joiner chooses to tell the host about itself: only the
    // display name, everything else in the profile stays on device.
    //
    // It goes in `metadata`, which is the sanctioned app-specific slot.  We used to
    // pass `{ name }` at the top level behind an `as any` — `StrandFormationDisclosure`
    // has no such field, so it was being dropped silently, and the cast is what hid it.
    let result: Awaited<ReturnType<typeof node.formStrand>>;
    try {
      result = await node.formStrand(invitation, {
        ...(profile.name ? { metadata: { name: profile.name } } : {}),
      });
    } catch (err) {
      throw explainJoinFailure(err);
    }

    const { strandId, memberPrivateKey } = result;

    if (__DEV__) {
      // THE CROSS-PARTY DISCOVERY SEED, and the one thing we cannot see from
      // either side afterwards. cadre-core calls `strandAddrs` "the only
      // cross-party discovery seed there is": a strand runs as its own libp2p
      // node, and the strand-addr RPC that would otherwise resolve one answers
      // own-party callers only. If this arrives empty the joiner has nowhere to
      // dial, and the failure surfaces much later as `StrandAwaitingFirstSyncError`
      // — "no member of this strand has been reachable" — which reads like a
      // network fault rather than a seed that was never sent.
      const seed = (result as { strandAddrs?: string[] }).strandAddrs ?? [];
      console.info(`[accept] formation seed: ${seed.length} strand addr(s), memberKey=${!!memberPrivateKey}`);
      for (const addr of seed) console.info('[accept]   seed:', addr);
    }
    // THE HOST STRAND'S TYPE DECIDES THIS, not a constant.
    //
    // `memberPrivateKey` is the closed strand's read-gating secret, returned by
    // formation only when the host strand is closed. Its presence is therefore
    // the honest signal of which kind of strand we were invited into. We used to
    // hard-code `Type: 'c'` and pass `memberPrivateKey ?? null`, which on an open
    // host strand produced a closed strand carrying no key — readable by nobody,
    // including us.
    // `FounderOwnerKey: null` is CORRECT, not a gap: this row was seated by
    // consent, so it records no trustworthy founding signer. `joinChatStrand`
    // passes `founder: false` explicitly so nothing derives founder-ness from it.
    const joinedRow = memberPrivateKey
      ? { Id: strandId, MemberPrivateKey: memberPrivateKey, Type: 'c' as const, FounderOwnerKey: null }
      : { Id: strandId, MemberPrivateKey: null, Type: 'o' as const, FounderOwnerKey: null };

    // REMEMBER FIRST, ATTACH SECOND. `memberPrivateKey` is delivered exactly once,
    // here, and is written to neither side's control DB — if this device forgets
    // it, the conversation can never be reopened. Attaching can legitimately fail
    // with `StrandAwaitingFirstSyncError` (retryable, strand stays launched), and
    // recording only on success would discard precisely the memberships that need
    // retrying most.
    await rememberJoinedStrand(joinedRow);

    // NARRATE THE ATTACH. `addStrand` resolves only once the strand is writable,
    // so on the failing path this call is a 30-second silence ending in
    // `StrandAwaitingFirstSyncError` — no indication of whether the joiner ever
    // reached anybody, or how far it got. These lines turn that silence into a
    // timeline we can compare against the Node harness, which does the identical
    // sequence in 1.2 s.
    if (__DEV__) {
      const t0 = Date.now();
      const tick = setInterval(() => {
        const inst = node.getStrands().get(strandId);
        console.info(
          `[accept] +${Math.round((Date.now() - t0) / 1000)}s attaching — status=${inst?.status ?? 'not-tracked'} ` +
            `database=${!!inst?.database} peers=${inst?.connectedPeers ?? '?'} myAddrs=${node.getMultiaddrs().length}`,
        );
      }, 5000);
      try {
        const instance = await attachAndAwaitWritable(node, joinedRow);
        // Put ourselves in App.Member before declaring the join done — otherwise
        // we are in the conversation but absent from it, and the other party has
        // no row saying we arrived.
        await registerSelfAsMember(instance);
        console.info(`[accept] ✓ attached in ${Date.now() - t0}ms`);
      } finally {
        clearInterval(tick);
      }
    } else {
      await registerSelfAsMember(await attachAndAwaitWritable(node, joinedRow));
    }

    return { strandId };
  }

  // ── Not yet wired ──────────────────────────────────────────────────────
  // Each of these needs cadre-core surface that does not exist or is not
  // reachable from a solo device.  See design/stories/mobile/STATUS.md §G.

  async getStrandState(strandId: string): Promise<StrandState> {
    // Membership and manager rows are sereus's, and no production path writes
    // them yet (domain/sereus.md).  Until per-party identity lands, the honest
    // answer for a solo strand is: private, and I can still act.
    const strand = await this.strandFor(strandId);
    return {
      visibility: (strand as any).type === 'o' ? 'public' : 'private',
      managerCount: 1,
      settled: false,
      canIManage: true,
    };
  }

  async listMembers(strandId: string): Promise<Member[]> {
    const strand = await this.strandFor(strandId);
    const me = cadreService.peerId ?? '';
    const rows = await queryMembers(strand);
    return rows.map(r => ({
      id: r.Id,
      name: r.Name,
      avatarUri: r.AvatarUri ?? null,
      isManager: r.Id === me,   // not readable yet; see getStrandState
      isMe: r.Id === me,
    }));
  }

  async listAttachments(strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Attachment[]> {
    const strand = await this.strandFor(strandId);
    const rows = await queryAttachments(strand);
    return rows
      .filter(r => !opts?.kind || r.Type === opts.kind)
      .map(r => ({
        id: r.Id,
        messageId: r.MessageId,
        type: r.Type as Attachment['type'],
        uri: r.Uri,
        mimeType: r.MimeType,
        name: r.Name,
        byteSize: r.ByteSize ?? null,
        durationMs: r.DurationMs ?? null,
        // A row held with no URI is being fetched — a null URI must never read
        // as absent (domain/overview.md).
        locality: r.Uri ? ('local' as const) : ('fetching' as const),
      }));
  }

  async editMessage(strandId: string, id: string, content: string): Promise<void> {
    await updateMessage(await this.strandFor(strandId), id, content);
  }

  async deleteMessage(strandId: string, id: string): Promise<void> {
    await removeMessage(await this.strandFor(strandId), id);
  }

  async react(strandId: string, id: string, symbol: string): Promise<void> {
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');
    await addReaction(await this.strandFor(strandId), id, peerId, symbol);
  }

  async unreact(strandId: string, id: string, symbol: string): Promise<void> {
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');
    await removeReaction(await this.strandFor(strandId), id, peerId, symbol);
  }
  /**
   * Leave a strand, or forget it entirely (story 33).
   *
   * `keepIdentity: true` is LEAVE — stop taking part, keep what identifies this
   * user in the strand so a later invitation returns them as themselves.
   * `false` is FORGET — the membership key goes too, so a re-invite arrives as a
   * stranger. Both remove the strand from this party's control database, which is
   * what stops it coming back on the next launch; neither removes it from anybody
   * else, and the screen must not offer an option that claims to.
   *
   * CAVEAT the caller should know: "forget" does NOT erase the local copy. See
   * `leaveStrandLocally` — cadre-core retains the strand's durable storage and
   * offers no purge step, so the blocks stay on disk.
   */
  async leaveStrand(id: string, o: { keepIdentity: boolean }): Promise<void> {
    await leaveStrandLocally(id, o);
  }
  async resignManager(_id: string): Promise<void> { this.notImplemented('resignManager'); }
  async removeMember(_s: string, _m: string): Promise<void> { this.notImplemented('removeMember'); }
  async listOutstandingInvitations(): Promise<Invitation[]> {
    const node = cadreService.cadreNode;
    const control = node?.getControlDatabase();
    return listOutgoingInvitations(async inv => {
      // The shared token is the ENCODED invitation; FormationUsage is keyed by the
      // raw token inside it.
      if (!node || !control) return null;
      try {
        // Time-boxed: a control-database read on a node with no reachable cohort
        // can hang (sereus.md), and the strand list asks this every 10 s.
        return await withTimeout(
          control.countFormationUsage(node.decodeInvitation(inv.token).token),
          3000,
          'countFormationUsage',
        );
      } catch {
        return null;
      }
    }, async strandId => {
      const strand = cadreService.getStrands().get(strandId);
      if (!strand?.database) return null;
      return queryMembers(strand).then(m => m.length).catch(() => null);
    });
  }
  /** Stops LISTING it; does not withdraw it — see outgoing-invitations.ts. */
  async cancelInvitation(id: string): Promise<void> {
    await forgetOutgoingInvitation(id);
  }
  async reachability(): Promise<{ reachable: boolean; relayPending: boolean }> {
    const node = cadreService.cadreNode;
    const reachable = !!node && node.getMultiaddrs().length > 0;
    if (reachable) return { reachable, relayPending: false };
    const { relayAddrs } = await this.getPrefs();
    return { reachable, relayPending: relayAddrs.length > 0 };
  }
  /**
   * Read an invitation without redeeming it.
   *
   * PURELY LOCAL, and it has to be: an `OpenInvitation` is a bearer token
   * carrying `{ token, sAppId, expiration, bootstrap }` and nothing else.  The
   * `FormationInvite` row that says whether a token is still redeemable lives in
   * the HOST's control database, which an invitee cannot read until they have
   * joined — so there is no peek, and cadre-core exposes none.
   *
   * What that means for each field:
   *
   * - `status` — `invalid` when the token will not decode, `expired` past its
   *   own expiration, else `live`.  **`spent` and `cancelled` are not knowable
   *   here.**  Both are host-side facts, and a token that has been used or
   *   withdrawn is indistinguishable from a live one until redemption fails.
   *   We report `live` and let `acceptInvitation` surface the truth, rather
   *   than guessing — the acceptance screen already handles a failed accept.
   * - `inviterName` / `inviterAvatarUri` — NOT in the token.  Empty, so the
   *   screen falls back to its unattributed wording rather than inventing a
   *   name.
   * - `strandState` — NOT in the token either.  Reported as a private,
   *   unsettled strand with no manager rights: the most conservative shape,
   *   and the one that overstates nothing about what the invitee is joining.
   * - `grantsInviteRight` — likewise absent; `false` is the safe claim.
   *
   * ⚠️ This leaves story 03 partly unmet: it requires that "before accepting,
   * the user sees who is inviting them, whether the strand is private, and
   * [on what terms]".  The platform cannot supply any of that pre-join.
   * Carrying the inviter's claimed name in the invitation LINK (as
   * `relay-offer` already does for a relay's claimed name, labelled as a claim
   * nothing proves) would satisfy it without inventing trust — but that is a
   * design decision for the stories, not something to slip in here.
   */
  async inspectInvitation(token: string): Promise<InvitationPreview> {
    const node = cadreService.cadreNode;
    if (!node) throw new Error('Cadre is not running.');

    const unknownState: StrandState = {
      visibility: 'private',
      managerCount: 1,
      settled: false,
      canIManage: false,
    };

    let expiration: Date;
    try {
      ({ expiration } = node.decodeInvitation(token));
    } catch {
      return {
        inviterName: '', inviterAvatarUri: null,
        strandState: unknownState, grantsInviteRight: false, status: 'invalid',
      };
    }

    return {
      inviterName: '',
      inviterAvatarUri: null,
      strandState: unknownState,
      grantsInviteRight: false,
      status: expiration.getTime() <= Date.now() ? 'expired' : 'live',
    };
  }
  // ── Device-local.  Never strand data, never replicated: settings are
  //    per-device by design and sidestep the missing party-private store
  //    (gotchoices/sereus#6).

  async getPrefs(): Promise<Prefs> {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  }

  async setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
    const next = { ...(await this.getPrefs()), ...patch };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    // Applying relays can REBUILD the node (they are named at construction — see
    // `CadreService.applyRelays`), so it is deliberately not awaited: accepting a
    // relay should return to the UI immediately and reconnect behind it. Fail-soft
    // — a relay that is down leaves the app working, just unreachable.
    if (patch.relayAddrs) {
      void cadreService.applyRelays(next.relayAddrs).catch(err =>
        console.warn('[prefs] applying relays failed:', err),
      );
    }
    return next;
  }

  async storageUsage(): Promise<StorageUsage> {
    // What this device is holding, strand by strand.  Attachment byte sizes are
    // what we can account for; block-level storage is the platform's and is not
    // exposed.
    const byStrand: StorageUsage['byStrand'] = [];
    for (const [id, strand] of cadreService.getStrands()) {
      if (!strand.database) continue;
      try {
        const rows = await queryAttachments(strand);
        byStrand.push({
          strandId: id,
          title: `Strand ${id.slice(0, 8)}`,
          bytes: rows.reduce((n, r) => n + (r.ByteSize ?? 0), 0),
        });
      } catch { /* a strand we cannot read right now contributes nothing */ }
    }
    byStrand.sort((a, b) => b.bytes - a.bytes);
    return { totalBytes: byStrand.reduce((n, s) => n + s.bytes, 0), byStrand };
  }

  async trimStorage(): Promise<{ bytesFreed: number }> {
    // Dropping local copies without weakening what the strand can still serve
    // is an unresolved platform question (domain/sereus.md) — not guessed at here.
    this.notImplemented('trimStorage');
  }
}
