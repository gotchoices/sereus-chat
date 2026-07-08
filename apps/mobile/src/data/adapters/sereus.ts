// Sereus adapter — talks to the live cadre stack (CadreNode → strand Quereus DB).
// See design/specs/domain/interfaces.md for the operation→sereus mapping
// and design/specs/domain/sereus.md for the integration boundary.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DataAdapter } from '../adapter';
import type { Profile, StrandSummary, ChatMessage, Invitation } from '../types';
import { ensureDefaultChatStrand, syncProfileNameToStrands } from '../chat-strand';
import { queryMessages, insertMessage } from '../chat-operations';
import { CHAT_SAPP_ID } from '../chat-sapp';
import { cadreService } from '../../cadre';

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

  async listMessages(_strandId: string): Promise<ChatMessage[]> {
    const strand = await ensureDefaultChatStrand();
    const rows = await queryMessages(strand);
    const myPeerId = cadreService.peerId ?? '';
    return rows.map(r => ({
      id: String(r.Id),
      strandId: strand.strandId,
      sender: r.MemberName ?? r.MemberId.slice(0, 12),
      text: r.Content,
      timestamp: r.Timestamp,
      outgoing: r.MemberId === myPeerId,
      status: (r.Status as ChatMessage['status']) ?? 'sent',
    }));
  }

  async sendMessage(_strandId: string, text: string): Promise<ChatMessage> {
    const strand = await ensureDefaultChatStrand();
    const peerId = cadreService.peerId;
    if (!peerId) throw new Error('Peer ID not available; cadre may not be running');

    const row = await insertMessage(strand, peerId, text);
    return {
      id: String(row.Id),
      strandId: strand.strandId,
      sender: peerId.slice(0, 12),
      text: row.Content,
      timestamp: row.Timestamp,
      outgoing: true,
      status: 'sent',
    };
  }

  // ── Step 5 (partial): in-memory strand list ──────────────────────────
  // Reads attached strands from `node.getStrands()`.  Today this is just
  // the default chat strand; cross-party strands surfaced via the Control
  // DB will join this list once invitation/formation flow is wired (step 8).

  async listStrands(): Promise<StrandSummary[]> {
    // Ensure the default strand is attached so it shows up.
    const defaultStrand = await ensureDefaultChatStrand();
    const defaultId = defaultStrand.strandId;

    const strands = cadreService.getStrands();
    const summaries: StrandSummary[] = [];

    for (const [id, strand] of strands) {
      if (!strand.database) continue;
      let preview: StrandSummary['lastMessage'] = null;
      try {
        const msgs = await queryMessages(strand, 1);
        const last = msgs[msgs.length - 1];
        if (last) {
          preview = { previewText: last.Content, timestamp: last.Timestamp };
        }
      } catch (err) {
        console.warn('[SereusAdapter] last-message preview failed for', id, err);
      }
      summaries.push({
        id,
        // Solo placeholder until partner metadata exists.  When step 8 wires
        // up cross-party strands, this becomes the partner's display name.
        displayName: id === defaultId ? 'My Notes' : `Strand ${id.slice(0, 8)}`,
        avatarUrl: null,
        lastMessage: preview,
        unreadCount: 0,
      });
    }
    return summaries;
  }

  // ── Step 5+ ────────────────────────────────────────────────────────────

  async searchStrands(query: string): Promise<StrandSummary[]> {
    const defaultStrand = await ensureDefaultChatStrand();
    const defaultId = defaultStrand.strandId;
    const q = query.trim().toLowerCase();

    const out: StrandSummary[] = [];
    for (const [id, strand] of cadreService.getStrands()) {
      if (!strand.database) continue;
      let preview: StrandSummary['lastMessage'] = null;
      try {
        const msgs = await queryMessages(strand);
        if (q === '') {
          // Empty query → behave like listStrands: return everything with
          // its last message as preview.
          const last = msgs[msgs.length - 1];
          preview = last ? { previewText: last.Content, timestamp: last.Timestamp } : null;
        } else {
          // Newest matching message wins as the preview.
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].Content.toLowerCase().includes(q)) {
              preview = { previewText: msgs[i].Content, timestamp: msgs[i].Timestamp };
              break;
            }
          }
          if (!preview) continue; // no match in this strand
        }
      } catch (err) {
        console.warn('[SereusAdapter] search failed for', id, err);
        continue;
      }
      out.push({
        id,
        displayName: id === defaultId ? 'My Notes' : `Strand ${id.slice(0, 8)}`,
        avatarUrl: null,
        lastMessage: preview,
        unreadCount: 0,
      });
    }
    return out;
  }

  // ── Profile (device-local; not stored in any sereus DB) ──────────────

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
   */
  async createInvitation(): Promise<Invitation> {
    const strand = await ensureDefaultChatStrand();
    const node = cadreService.cadreNode;
    if (!node) throw new Error('Cadre is not running');

    const invitation = await node.createOpenInvitation(CHAT_SAPP_ID, INVITE_EXPIRY_MS);

    await node.publishFormationInvite(invitation.token, CHAT_SAPP_ID, {
      expiresAtMs: invitation.expiration.getTime(),
      strandId: strand.strandId,
    });

    return {
      token: node.encodeInvitation(invitation),
      strandId: strand.strandId,
      createdAt: new Date().toISOString(),
      expiresAt: invitation.expiration.toISOString(),
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
}
