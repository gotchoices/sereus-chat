// Sereus adapter — talks to the live cadre stack (CadreNode → strand Quereus DB).
// See design/specs/domain/interfaces.md for the operation→sereus mapping
// and design/specs/domain/sereus.md for the integration boundary.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataAdapter } from '../adapter';
import type {
  Profile, StrandSummary, StrandState, Member, Message, Attachment,
  SearchBatch, SearchOptions, Invitation, InvitationPreview,
  Prefs, StorageUsage, SendInput,
} from '../types';
import { ensureDefaultChatStrand, getDefaultChatStrand, syncProfileNameToStrands } from '../chat-strand';
import { joinChatStrand } from '../chat-sapp';
import {
  queryMessages, insertMessage, updateMessage, removeMessage,
  addReaction, removeReaction, queryReactions, queryAttachments, queryMembers,
  insertAttachments,
} from '../chat-operations';
import { UnreachableError } from '../errors';
import { CHAT_SAPP_ID } from '../chat-sapp';
import { cadreService } from '../../cadre';
import { withTimeout, CONTROL_OP_TIMEOUT_MS } from '../../cadre/async';

const PROFILE_KEY = '@sereus.chat/profile';
const PREFS_KEY = '@sereus.chat/prefs';

const DEFAULT_PREFS: Prefs = {
  theme: 'system', language: 'en', notifyDefault: 'all',
  storageCeilingBytes: null, perStrandOverrides: 0, relayAddrs: [],
};

/** Open invitations are valid for 24h — matches the cadre-core default. */
const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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

  async listMessages(_strandId: string, _opts?: { before?: string; limit?: number }): Promise<Message[]> {
    const strand = await ensureDefaultChatStrand();
    const [rows, reactions, atts] = await Promise.all([
      queryMessages(strand),
      queryReactions(strand).catch(() => []),
      queryAttachments(strand).catch(() => []),
    ]);
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

  async send(_strandId: string, input: SendInput): Promise<Message> {
    const strand = await ensureDefaultChatStrand();
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');

    // A local write.  There is no pending state to surface — the phone holds
    // the strand, so this either lands or genuinely fails.
    const row = await insertMessage(strand, peerId, input.content, input.replyToId);
    const saved = await insertAttachments(strand, row.Id, input.attachments ?? []);
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

  async listStrands(): Promise<StrandSummary[]> {
    // Kick the default-strand attach in the BACKGROUND — never block the list
    // on it.  Attaching a strand reads the control DB (queryCadrePeers), which
    // is slow/blocking on a solo node, and we want the list (empty or not) to
    // render immediately.  Once the strand attaches it shows on the next
    // refresh.  `defaultStrandId()` lets us still label it "My Notes".
    void ensureDefaultChatStrand().catch(err =>
      console.warn('[SereusAdapter] default strand attach deferred:', err instanceof Error ? err.message : err),
    );
    const defaultId = getDefaultChatStrand()?.strandId ?? null;

    const strands = cadreService.getStrands();
    const summaries: StrandSummary[] = [];

    for (const [id, strand] of strands) {
      if (!strand.database) continue;
      let preview: StrandSummary['lastMessage'] = null;
      try {
        const msgs = await queryMessages(strand, 1);
        const last = msgs[msgs.length - 1];
        if (last) {
          preview = { previewText: last.Content, senderName: null, timestamp: last.Timestamp };
        }
      } catch (err) {
        console.warn('[SereusAdapter] last-message preview failed for', id, err);
      }
      summaries.push({
        id,
        // Solo placeholder until partner metadata exists.  Strand titles are
        // the app's to own — sereus has no title slot (domain/schema.md).
        title: id === defaultId ? 'My Notes' : `Strand ${id.slice(0, 8)}`,
        avatarUri: null,
        isGroup: false,
        memberCount: 1,
        lastMessage: preview,
        unreadCount: 0,
        mentioned: false,
        muted: 'none',
        draftPreview: null,
        archived: false,
        pending: false,
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
    void ensureDefaultChatStrand().catch(() => {});
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
    visibility?: 'public' | 'private';
    grantsInviteRight: boolean;
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

    const strand = await ensureDefaultChatStrand();
    const invitation = await node.createOpenInvitation(CHAT_SAPP_ID, INVITE_EXPIRY_MS);

    await withTimeout(
      node.publishFormationInvite(invitation.token, CHAT_SAPP_ID, {
        expiresAtMs: invitation.expiration.getTime(),
        strandId: strand.strandId,
      }),
      CONTROL_OP_TIMEOUT_MS,
      'publishFormationInvite',
    );

    const token = node.encodeInvitation(invitation);
    return {
      id: token.slice(0, 12),
      token,
      url: `sereus://invite/${token}`,
      qrPayload: `sereus://invite/${token}`,
      strandId: strand.strandId,
      expiresAt: invitation.expiration.toISOString(),
      // The platform seats a member from a bearer invitation; invite rights
      // are conferred by a separate signed act (see STATUS.md §G).
      grantsInviteRight: input.grantsInviteRight,
      spent: false,
      direction: 'outgoing',
    };
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
    const result = await node.formStrand(invitation, {
      // Disclosure is what the joiner chooses to tell the host about itself.
      // Only the display name — everything else in the profile stays on device.
      name: profile.name || undefined,
    } as any);

    const strandId = (result as any).strandId as string;
    await joinChatStrand(node, {
      Id: strandId,
      MemberPrivateKey: (result as any).memberPrivateKey ?? null,
      Type: 'c',
    } as any);

    return { strandId };
  }

  // ── Not yet wired ──────────────────────────────────────────────────────
  // Each of these needs cadre-core surface that does not exist or is not
  // reachable from a solo device.  See design/stories/mobile/STATUS.md §G.

  async getStrandState(_strandId: string): Promise<StrandState> {
    // Membership and manager rows are sereus's, and no production path writes
    // them yet (domain/sereus.md).  Until per-party identity lands, the honest
    // answer for a solo strand is: private, and I can still act.
    const strand = await ensureDefaultChatStrand();
    return {
      visibility: (strand as any).type === 'o' ? 'public' : 'private',
      managerCount: 1,
      settled: false,
      canIManage: true,
    };
  }

  async listMembers(_strandId: string): Promise<Member[]> {
    const strand = await ensureDefaultChatStrand();
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

  async listAttachments(_strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Attachment[]> {
    const strand = await ensureDefaultChatStrand();
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

  async editMessage(id: string, content: string): Promise<void> {
    await updateMessage(await ensureDefaultChatStrand(), id, content);
  }

  async deleteMessage(id: string): Promise<void> {
    await removeMessage(await ensureDefaultChatStrand(), id);
  }

  async react(id: string, symbol: string): Promise<void> {
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');
    await addReaction(await ensureDefaultChatStrand(), id, peerId, symbol);
  }

  async unreact(id: string, symbol: string): Promise<void> {
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');
    await removeReaction(await ensureDefaultChatStrand(), id, peerId, symbol);
  }
  async leaveStrand(_id: string, _o: { keepIdentity: boolean }): Promise<void> { this.notImplemented('leaveStrand'); }
  async resignManager(_id: string): Promise<void> { this.notImplemented('resignManager'); }
  async removeMember(_s: string, _m: string): Promise<void> { this.notImplemented('removeMember'); }
  async listOutstandingInvitations(): Promise<Invitation[]> { this.notImplemented('listOutstandingInvitations'); }
  async cancelInvitation(_id: string): Promise<void> { this.notImplemented('cancelInvitation'); }
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
    // Reserving is fail-soft and must not block the caller: a relay that is
    // down should leave the app working, just unreachable.
    if (patch.relayAddrs) void cadreService.reserveRelays?.(next.relayAddrs);
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
