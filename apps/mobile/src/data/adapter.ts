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
// Static, not `await import()`: Metro's lazy bundles cannot reach a linked package
// outside the app folder ("Could not load bundle"), and the stack is loaded at start
// anyway (the host's node service is imported by the navigator).
import { createMockModel, type MockControls } from '@chat/core';
import { createSereusModel, type SereusModel } from '@chat/core/sereus';
import { chatHost } from '../host/chat-host';
import { adapterFromModel } from './legacy-adapter';
import { USE_SEREUS } from './config';

export interface DataAdapter {
  // ---- Strands -----------------------------------------------------------
  listStrands(): Promise<StrandSummary[]>;
  /**
   * Is the node still bringing strands up? An empty `listStrands()` means one of
   * two very different things — "you are in no conversations" or "we have not
   * finished attaching them yet" — and a screen that cannot tell them apart shows
   * a first-run message to someone who has strands. Attaching takes seconds on a
   * phone, so this is the normal case at launch, not an edge case.
   */
  strandsSettling(): Promise<boolean>;
  /**
   * Why start-up failed, or null. Distinct from `strandsSettling` on purpose: a
   * failed boot and a slow one are not the same thing to a person looking at an
   * empty list.
   */
  strandsBootError(): Promise<string | null>;
  /**
   * Re-attempt start-up after a failure. Distinct from re-reading the list: the
   * 3 s poll only ever nudges `ensureCadreUp`, which cannot re-run the discovery
   * sweep, so without this a boot that failed once stays failed for the life of
   * the process however many times the list refreshes.
   */
  retryBoot(): Promise<void>;
  /**
   * Device-local strand settings (story 33's mute and archive). Both are this
   * device's alone — `ops.md` is explicit that they "never touch strand data" —
   * so neither reaches the other members.
   */
  getStrandSettings(strandId: string): Promise<{ muted: 'none' | 'soft' | 'hard'; archived: boolean }>;
  setStrandMuted(strandId: string, muted: 'none' | 'soft' | 'hard'): Promise<void>;
  setStrandArchived(strandId: string, archived: boolean): Promise<void>;
  getStrandState(strandId: string): Promise<StrandState>;
  listMembers(strandId: string): Promise<Member[]>;
  listMessages(strandId: string, opts?: { before?: string; limit?: number }): Promise<Message[]>;
  listAttachments(strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Attachment[]>;

  // ---- Writes ------------------------------------------------------------
  send(strandId: string, input: SendInput): Promise<Message>;
  editMessage(strandId: string, messageId: string, content: string): Promise<void>;
  deleteMessage(strandId: string, messageId: string): Promise<void>;
  react(strandId: string, messageId: string, symbol: string): Promise<void>;
  unreact(strandId: string, messageId: string, symbol: string): Promise<void>;
  /** Device-local: an unsent draft and the last message read, per strand. */
  getDraft(strandId: string): Promise<string>;
  saveDraft(strandId: string, text: string): Promise<void>;
  getReadCursor(strandId: string): Promise<string | null>;
  saveReadCursor(strandId: string, messageId: string): Promise<void>;

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
    /** One person (default) or anyone with the link. */
    singleUse?: boolean;
    /** How long it stays good, ms. Default one week. */
    validForMs?: number;
  }): Promise<Invitation>;
  listOutstandingInvitations(): Promise<Invitation[]>;
  /**
   * Call `onChange` whenever this strand's chat tables change, by this device or,
   * once applied here, by another. Coarse: re-query on a wake. Returns null when the
   * strand is not open yet (try again later), else an unsubscribe.
   */
  watchStrand(strandId: string, onChange: () => void): (() => void) | null;
  cancelInvitation(id: string): Promise<void>;
  /**
   * Can anybody answer an invitation from this device right now — and if not,
   * is a relay already chosen and still connecting? The second case must not be
   * shown as "nowhere to be reached": the user has just done what that screen
   * asked of them.
   */
  reachability(): Promise<{ reachable: boolean; relayPending: boolean }>;
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
let mockControls: MockControls | null = null;
let sereus: SereusModel | null = null;

/**
 * Start-up for the Sereus model: watch for offered strands, start the node, re-attach
 * remembered joins. App.tsx runs it once the data format is known to be usable.
 */
export async function bootSereus(): Promise<void> {
  await getAdapter();
  await sereus?.boot();
}

async function createAdapter(): Promise<DataAdapter> {
  if (USE_SEREUS) {
    // The core's Sereus model over this app's host, behind the throwing adapter screens
    // still call (Phase 5; the adapter goes in Phase 6).
    sereus = createSereusModel(chatHost);
    return adapterFromModel(sereus.model);
  }
  // The core's mock model, behind the throwing adapter screens still call (Phase 4).
  const { appFixtures } = await import('./mock-fixtures');
  const mock = createMockModel(appFixtures);
  mockControls = mock.controls;
  mockControls.setVariant(pendingVariant);
  return adapterFromModel(mock.model);
}

/** The mock variant to serve; applied when the mock is created, and to it after. */
let pendingVariant: string = 'happy';
export function setMockVariant(variant: string): void {
  pendingVariant = variant;
  mockControls?.setVariant(variant);
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
export const strandsSettling = async () => (await getAdapter()).strandsSettling();
export const strandsBootError = async () => (await getAdapter()).strandsBootError();
export const retryBoot = async () => (await getAdapter()).retryBoot();
export const getStrandSettings = async (id: string) => (await getAdapter()).getStrandSettings(id);
export const setStrandMuted = async (id: string, m: 'none' | 'soft' | 'hard') =>
  (await getAdapter()).setStrandMuted(id, m);
export const setStrandArchived = async (id: string, a: boolean) =>
  (await getAdapter()).setStrandArchived(id, a);
export const getStrandState = async (id: string) => (await getAdapter()).getStrandState(id);
export const listMembers = async (id: string) => (await getAdapter()).listMembers(id);
export const listMessages = async (id: string, o?: { before?: string; limit?: number }) =>
  (await getAdapter()).listMessages(id, o);
export const listAttachments = async (id: string, o?: { kind?: Attachment['type'] }) =>
  (await getAdapter()).listAttachments(id, o);

export const send = async (id: string, input: SendInput) => (await getAdapter()).send(id, input);
export const editMessage = async (strandId: string, id: string, c: string) =>
  (await getAdapter()).editMessage(strandId, id, c);
export const deleteMessage = async (strandId: string, id: string) =>
  (await getAdapter()).deleteMessage(strandId, id);
export const react = async (strandId: string, id: string, s: string) =>
  (await getAdapter()).react(strandId, id, s);
export const unreact = async (strandId: string, id: string, s: string) =>
  (await getAdapter()).unreact(strandId, id, s);
export const getDraft = async (id: string) => (await getAdapter()).getDraft(id);
export const saveDraft = async (id: string, text: string) => (await getAdapter()).saveDraft(id, text);
export const getReadCursor = async (id: string) => (await getAdapter()).getReadCursor(id);
export const saveReadCursor = async (id: string, messageId: string) => (await getAdapter()).saveReadCursor(id, messageId);
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
export const reachability = async () => (await getAdapter()).reachability();
export const inspectInvitation = async (t: string) => (await getAdapter()).inspectInvitation(t);
export const acceptInvitation = async (t: string) => (await getAdapter()).acceptInvitation(t);

export const getProfile = async () => (await getAdapter()).getProfile();
export const saveProfile = async (p: Profile) => (await getAdapter()).saveProfile(p);
export const getPrefs = async () => (await getAdapter()).getPrefs();
export const setPrefs = async (p: Partial<Prefs>) => (await getAdapter()).setPrefs(p);
export const storageUsage = async () => (await getAdapter()).storageUsage();
export const trimStorage = async (id: string, c: Parameters<DataAdapter['trimStorage']>[1]) =>
  (await getAdapter()).trimStorage(id, c);
export const watchStrand = async (id: string, onChange: () => void) => (await getAdapter()).watchStrand(id, onChange);
