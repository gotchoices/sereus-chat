// Sereus adapter — talks to the live cadre stack (CadreNode → strand Quereus DB).
// See design/specs/domain/interfaces.md for the operation→sereus mapping
// and design/specs/domain/sereus.md for the integration boundary.

import type { DataAdapter } from '../adapter';
import type { Profile, StrandSummary, ChatMessage, Invitation } from '../types';
import { ensureDefaultChatStrand } from '../chat-strand';
import { queryMessages, insertMessage } from '../chat-operations';
import { cadreService } from '../../cadre';

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

  async searchStrands(_query: string): Promise<StrandSummary[]> {
    this.notImplemented('searchStrands');
  }

  async getProfile(): Promise<Profile> {
    this.notImplemented('getProfile');
  }

  async saveProfile(_profile: Profile): Promise<void> {
    this.notImplemented('saveProfile');
  }

  async createInvitation(): Promise<Invitation> {
    this.notImplemented('createInvitation');
  }

  async acceptInvitation(_token: string): Promise<{ strandId: string }> {
    this.notImplemented('acceptInvitation');
  }
}
