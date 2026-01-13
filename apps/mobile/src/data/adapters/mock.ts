// Mock adapter - reads variant from global config, returns JSON fixtures
// See specs/domain/interfaces.md

import type { DataAdapter } from '../adapter';
import type { Profile, StrandSummary, ChatMessage, Invitation } from '../types';

// Variant is read from this module-level state (set by VariantContext)
let currentVariant: string = 'happy';

export function setMockVariant(variant: string): void {
  currentVariant = variant;
}

export function getMockVariant(): string {
  return currentVariant;
}

// Import fixtures
import strandsHappy from '../../../mock/data/Strands/happy.json';
import strandsEmpty from '../../../mock/data/Strands/empty.json';
import strandsError from '../../../mock/data/Strands/error.json';
import messagesHappy from '../../../mock/data/Messages/happy.json';
import messagesEmpty from '../../../mock/data/Messages/empty.json';
import profileHappy from '../../../mock/data/Profile/happy.json';
import profileEmpty from '../../../mock/data/Profile/empty.json';

export class MockAdapter implements DataAdapter {
  async listStrands(): Promise<StrandSummary[]> {
    if (currentVariant === 'empty') return strandsEmpty as StrandSummary[];
    if (currentVariant === 'error') throw new Error((strandsError as any).error || 'Mock error');
    return strandsHappy as StrandSummary[];
  }

  async listMessages(strandId: string): Promise<ChatMessage[]> {
    if (!strandId) return [];
    const source = currentVariant === 'empty' ? messagesEmpty : messagesHappy;
    return (source as ChatMessage[]).filter(m => m.strandId === strandId);
  }

  async sendMessage(_strandId: string, _text: string): Promise<ChatMessage> {
    // Mock: no-op, handled locally in UI
    throw new Error('Mock sendMessage not implemented');
  }

  async searchStrands(query: string): Promise<StrandSummary[]> {
    const all = await this.listStrands();
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(s =>
      s.displayName.toLowerCase().includes(q) ||
      s.lastMessage?.previewText?.toLowerCase().includes(q)
    );
  }

  async getProfile(): Promise<Profile> {
    if (currentVariant === 'empty') return (profileEmpty as Profile) || { name: '' };
    return (profileHappy as Profile) || { name: 'User' };
  }

  async saveProfile(_profile: Profile): Promise<void> {
    // No-op in mock mode - writes not persisted
  }

  async createInvitation(): Promise<Invitation> {
    const token = Math.random().toString(36).slice(2, 10);
    return {
      token,
      createdAt: new Date().toISOString(),
    };
  }

  async acceptInvitation(token: string): Promise<{ strandId: string }> {
    // Mock: just return a fake strand ID
    return { strandId: `strand-${token}` };
  }
}

