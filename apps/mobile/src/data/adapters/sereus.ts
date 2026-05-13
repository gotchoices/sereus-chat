// Sereus adapter — talks to the live cadre stack (CadreNode → strand Quereus DB).
// Stub for now; wired up when the cadre layer (src/cadre/) lands.
// See design/specs/domain/interfaces.md for the operation→sereus mapping
// and design/specs/domain/sereus.md for the integration boundary.

import type { DataAdapter } from '../adapter';
import type { Profile, StrandSummary, ChatMessage, Invitation } from '../types';

export class SereusAdapter implements DataAdapter {
  private notImplemented(op: string): never {
    throw new Error(
      `SereusAdapter.${op} not implemented — cadre layer not yet wired. ` +
        `Set USE_SEREUS = false in src/data/config.ts to fall back to mocks.`,
    );
  }

  async listStrands(): Promise<StrandSummary[]> {
    this.notImplemented('listStrands');
  }

  async listMessages(_strandId: string): Promise<ChatMessage[]> {
    this.notImplemented('listMessages');
  }

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
