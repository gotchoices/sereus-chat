// Data adapter interface — all backends implement this contract.
// See design/specs/domain/ops.md for operation semantics and
// design/specs/domain/interfaces.md for the operation→sereus mapping.

import type { Profile, StrandSummary, ChatMessage, Invitation } from './types';
import { USE_SEREUS } from './config';

export interface DataAdapter {
  // Strands
  listStrands(): Promise<StrandSummary[]>;
  listMessages(strandId: string): Promise<ChatMessage[]>;
  sendMessage(strandId: string, text: string): Promise<ChatMessage>;
  searchStrands(query: string): Promise<StrandSummary[]>;

  // Profile (local scope)
  getProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;

  // Invitations
  createInvitation(): Promise<Invitation>;
  acceptInvitation(token: string): Promise<{ strandId: string }>;
}

let currentAdapter: DataAdapter | null = null;

async function createAdapter(): Promise<DataAdapter> {
  if (USE_SEREUS) {
    const { SereusAdapter } = await import('./adapters/sereus');
    return new SereusAdapter();
  }
  const { MockAdapter } = await import('./adapters/mock');
  return new MockAdapter();
}

export async function getAdapter(): Promise<DataAdapter> {
  if (!currentAdapter) {
    currentAdapter = await createAdapter();
  }
  return currentAdapter;
}

// Convenience functions that use the current adapter
export async function listStrands(): Promise<StrandSummary[]> {
  return (await getAdapter()).listStrands();
}

export async function listMessages(strandId: string): Promise<ChatMessage[]> {
  return (await getAdapter()).listMessages(strandId);
}

export async function sendMessage(strandId: string, text: string): Promise<ChatMessage> {
  return (await getAdapter()).sendMessage(strandId, text);
}

export async function searchStrands(query: string): Promise<StrandSummary[]> {
  return (await getAdapter()).searchStrands(query);
}

export async function getProfile(): Promise<Profile> {
  return (await getAdapter()).getProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  return (await getAdapter()).saveProfile(profile);
}

export async function createInvitation(): Promise<Invitation> {
  return (await getAdapter()).createInvitation();
}

export async function acceptInvitation(token: string): Promise<{ strandId: string }> {
  return (await getAdapter()).acceptInvitation(token);
}
