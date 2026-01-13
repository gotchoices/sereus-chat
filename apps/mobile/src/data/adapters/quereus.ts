// Quereus adapter stub - SQL backend via Quereus
// See specs/domain/interfaces.md and specs/domain/schema.md

import type { DataAdapter, BackendMode } from '../adapter';
import type { Profile, StrandSummary, ChatMessage, Invitation } from '../types';

export class QuereusAdapter implements DataAdapter {
  private mode: BackendMode;

  constructor(mode: BackendMode) {
    this.mode = mode;
  }

  private notImplemented(op: string): never {
    throw new Error(`QuereusAdapter.${op} not implemented (mode: ${this.mode})`);
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

