// Data adapter interface - all backends implement this contract
// See specs/domain/ops.md for operation semantics

import type { Profile, StrandSummary, ChatMessage, Invitation } from './types';

export interface DataAdapter {
  // Strands
  listStrands(): Promise<StrandSummary[]>;
  listMessages(strandId: string): Promise<ChatMessage[]>;
  searchStrands(query: string): Promise<StrandSummary[]>;

  // Profile (local scope)
  getProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;

  // Invitations
  createInvitation(): Promise<Invitation>;
  acceptInvitation(token: string): Promise<{ strandId: string }>;
}

// Backend mode from environment or build config
export type BackendMode = 'mock' | 'quereus-memory' | 'quereus-store' | 'quereus-sync' | 'quereus-optimystic';

let currentAdapter: DataAdapter | null = null;
let currentMode: BackendMode = 'mock';

export function getBackendMode(): BackendMode {
  return currentMode;
}

export function setBackendMode(mode: BackendMode): void {
  currentMode = mode;
  currentAdapter = null; // Force re-creation
}

export async function getAdapter(): Promise<DataAdapter> {
  if (currentAdapter) return currentAdapter;

  switch (currentMode) {
    case 'mock': {
      const { MockAdapter } = await import('./adapters/mock');
      currentAdapter = new MockAdapter();
      break;
    }
    case 'quereus-memory':
    case 'quereus-store':
    case 'quereus-sync':
    case 'quereus-optimystic': {
      const { QuereusAdapter } = await import('./adapters/quereus');
      currentAdapter = new QuereusAdapter(currentMode);
      break;
    }
    default:
      throw new Error(`Unknown backend mode: ${currentMode}`);
  }

  return currentAdapter;
}

// Convenience functions that use the current adapter
export async function listStrands(): Promise<StrandSummary[]> {
  const adapter = await getAdapter();
  return adapter.listStrands();
}

export async function listMessages(strandId: string): Promise<ChatMessage[]> {
  const adapter = await getAdapter();
  return adapter.listMessages(strandId);
}

export async function searchStrands(query: string): Promise<StrandSummary[]> {
  const adapter = await getAdapter();
  return adapter.searchStrands(query);
}

export async function getProfile(): Promise<Profile> {
  const adapter = await getAdapter();
  return adapter.getProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  const adapter = await getAdapter();
  return adapter.saveProfile(profile);
}

export async function createInvitation(): Promise<Invitation> {
  const adapter = await getAdapter();
  return adapter.createInvitation();
}

export async function acceptInvitation(token: string): Promise<{ strandId: string }> {
  const adapter = await getAdapter();
  return adapter.acceptInvitation(token);
}

