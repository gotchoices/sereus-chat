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
import { queryMessages, insertMessage } from '../chat-operations';
import { CHAT_SAPP_ID } from '../chat-sapp';
import { cadreService } from '../../cadre';
import { withTimeout, CONTROL_OP_TIMEOUT_MS } from '../../cadre/async';

const PROFILE_KEY = '@sereus.chat/profile';

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
    const rows = await queryMessages(strand);
    // No status is read: none is tracked (design/specs/domain/schema.md).
    return rows.map(r => ({
      id: String(r.Id),
      memberId: r.MemberId,
      content: r.Content,
      timestamp: r.Timestamp,
      replyToId: null,
      editedAt: null,
      attachments: [],
      reactions: [],
    }));
  }

  async send(_strandId: string, input: SendInput): Promise<Message> {
    const strand = await ensureDefaultChatStrand();
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');

    // A local write.  There is no pending state to surface — the phone holds
    // the strand, so this either lands or genuinely fails.
    const row = await insertMessage(strand, peerId, input.content);
    return {
      id: String(row.Id),
      memberId: peerId,
      content: row.Content,
      timestamp: row.Timestamp,
      replyToId: input.replyToId ?? null,
      editedAt: null,
      attachments: [],
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
              messageId: String(m.Id),
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
      throw new Error(
        'This device has no reachable address yet. Add a node to your cadre ' +
          '(a drone or server, under "My Devices") so friends have somewhere to connect, ' +
          'then try again.',
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
   * Redeem an encoded invitation.  Still unwired: `formStrand` performs a
   * consent handshake with the host over libp2p, so it needs a reachable
   * host — it cannot be exercised on a single device.  Wiring it also means
   * handling `FormStrandResult.memberPrivateKey` (NOT `invitePrivateKey`)
   * when attaching the resulting strand.  See STATUS.md "First partner".
   */
  async acceptInvitation(_token: string): Promise<{ strandId: string }> {
    this.notImplemented('acceptInvitation');
  }

  // ── Not yet wired ──────────────────────────────────────────────────────
  // Each of these needs cadre-core surface that does not exist or is not
  // reachable from a solo device.  See design/stories/mobile/STATUS.md §G.

  async getStrandState(_strandId: string): Promise<StrandState> { this.notImplemented('getStrandState'); }
  async listMembers(_strandId: string): Promise<Member[]> { this.notImplemented('listMembers'); }
  async listAttachments(_strandId: string): Promise<Attachment[]> { this.notImplemented('listAttachments'); }
  async editMessage(_id: string, _content: string): Promise<void> { this.notImplemented('editMessage'); }
  async deleteMessage(_id: string): Promise<void> { this.notImplemented('deleteMessage'); }
  async react(_id: string, _symbol: string): Promise<void> { this.notImplemented('react'); }
  async unreact(_id: string, _symbol: string): Promise<void> { this.notImplemented('unreact'); }
  async leaveStrand(_id: string, _o: { keepIdentity: boolean }): Promise<void> { this.notImplemented('leaveStrand'); }
  async resignManager(_id: string): Promise<void> { this.notImplemented('resignManager'); }
  async removeMember(_s: string, _m: string): Promise<void> { this.notImplemented('removeMember'); }
  async listOutstandingInvitations(): Promise<Invitation[]> { this.notImplemented('listOutstandingInvitations'); }
  async cancelInvitation(_id: string): Promise<void> { this.notImplemented('cancelInvitation'); }
  async inspectInvitation(_t: string): Promise<InvitationPreview> { this.notImplemented('inspectInvitation'); }
  async getPrefs(): Promise<Prefs> { this.notImplemented('getPrefs'); }
  async setPrefs(_p: Partial<Prefs>): Promise<Prefs> { this.notImplemented('setPrefs'); }
  async storageUsage(): Promise<StorageUsage> { this.notImplemented('storageUsage'); }
  async trimStorage(): Promise<{ bytesFreed: number }> { this.notImplemented('trimStorage'); }
}
