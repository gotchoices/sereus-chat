// Data adapter interface — all backends implement this contract.
// Semantics: design/specs/domain/ops.md.  Mapping: design/specs/domain/interfaces.md.
//
// Screens call these and nothing else.  No screen knows whether a call is
// served by mock fixtures or a live cadre, and no screen takes a `variant`
// parameter — variant is a mock-only side channel.

import type {
  Profile, StrandSummary, StrandState, Member, Message, Attachment,
  SearchBatch, SearchOptions, Invitation, InvitationPreview,
  Prefs, StorageUsage, SendInput,
} from './types';
import { USE_SEREUS } from './config';

export interface DataAdapter {
  // ---- Strands -----------------------------------------------------------
  listStrands(): Promise<StrandSummary[]>;
  getStrandState(strandId: string): Promise<StrandState>;
  listMembers(strandId: string): Promise<Member[]>;
  listMessages(strandId: string, opts?: { before?: string; limit?: number }): Promise<Message[]>;
  listAttachments(strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Attachment[]>;

  // ---- Writes ------------------------------------------------------------
  send(strandId: string, input: SendInput): Promise<Message>;
  editMessage(messageId: string, content: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  react(messageId: string, symbol: string): Promise<void>;
  unreact(messageId: string, symbol: string): Promise<void>;

  /** keepIdentity:false is permanent — a later return is as a new member. */
  leaveStrand(strandId: string, opts: { keepIdentity: boolean }): Promise<void>;
  resignManager(strandId: string): Promise<void>;
  removeMember(strandId: string, memberId: string): Promise<void>;

  // ---- Search ------------------------------------------------------------
  /**
   * A stream, not a promise: there is no cross-strand index and most strands
   * are not running until something wakes them.  Cancelling must stop the
   * sweep — an abandoned search must not go on waking strands.
   */
  search(query: string, opts?: SearchOptions): AsyncIterable<SearchBatch>;

  // ---- Invitations -------------------------------------------------------
  createInvitation(input: {
    strandId?: string;
    visibility?: 'public' | 'private';
    grantsInviteRight: boolean;
  }): Promise<Invitation>;
  listOutstandingInvitations(): Promise<Invitation[]>;
  cancelInvitation(id: string): Promise<void>;
  inspectInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<{ strandId: string }>;

  // ---- Local scope -------------------------------------------------------
  getProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<Prefs>;
  storageUsage(): Promise<StorageUsage>;
  trimStorage(strandId: string, criteria: { olderThan?: string; kind?: Attachment['type'] }): Promise<{ bytesFreed: number }>;
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
  if (!currentAdapter) currentAdapter = await createAdapter();
  return currentAdapter;
}

/** Test/dev seam — lets a harness swap the backend without a reload. */
export function __setAdapter(a: DataAdapter | null): void {
  currentAdapter = a;
}

// Convenience wrappers ------------------------------------------------------

export const listStrands = async () => (await getAdapter()).listStrands();
export const getStrandState = async (id: string) => (await getAdapter()).getStrandState(id);
export const listMembers = async (id: string) => (await getAdapter()).listMembers(id);
export const listMessages = async (id: string, o?: { before?: string; limit?: number }) =>
  (await getAdapter()).listMessages(id, o);
export const listAttachments = async (id: string, o?: { kind?: Attachment['type'] }) =>
  (await getAdapter()).listAttachments(id, o);

export const send = async (id: string, input: SendInput) => (await getAdapter()).send(id, input);
export const editMessage = async (id: string, c: string) => (await getAdapter()).editMessage(id, c);
export const deleteMessage = async (id: string) => (await getAdapter()).deleteMessage(id);
export const react = async (id: string, s: string) => (await getAdapter()).react(id, s);
export const unreact = async (id: string, s: string) => (await getAdapter()).unreact(id, s);
export const leaveStrand = async (id: string, o: { keepIdentity: boolean }) =>
  (await getAdapter()).leaveStrand(id, o);
export const resignManager = async (id: string) => (await getAdapter()).resignManager(id);
export const removeMember = async (sid: string, mid: string) =>
  (await getAdapter()).removeMember(sid, mid);

export async function* search(query: string, opts?: SearchOptions): AsyncIterable<SearchBatch> {
  const a = await getAdapter();
  yield* a.search(query, opts);
}

export const createInvitation = async (i: Parameters<DataAdapter['createInvitation']>[0]) =>
  (await getAdapter()).createInvitation(i);
export const listOutstandingInvitations = async () =>
  (await getAdapter()).listOutstandingInvitations();
export const cancelInvitation = async (id: string) => (await getAdapter()).cancelInvitation(id);
export const inspectInvitation = async (t: string) => (await getAdapter()).inspectInvitation(t);
export const acceptInvitation = async (t: string) => (await getAdapter()).acceptInvitation(t);

export const getProfile = async () => (await getAdapter()).getProfile();
export const saveProfile = async (p: Profile) => (await getAdapter()).saveProfile(p);
export const getPrefs = async () => (await getAdapter()).getPrefs();
export const setPrefs = async (p: Partial<Prefs>) => (await getAdapter()).setPrefs(p);
export const storageUsage = async () => (await getAdapter()).storageUsage();
export const trimStorage = async (id: string, c: Parameters<DataAdapter['trimStorage']>[1]) =>
  (await getAdapter()).trimStorage(id, c);
