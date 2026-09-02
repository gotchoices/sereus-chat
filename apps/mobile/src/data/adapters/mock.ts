// Mock adapter — JSON fixtures, variant selected by deep link.
// See design/specs/domain/interfaces.md and appeus/reference/mock-variants.md.

import type { DataAdapter } from '../adapter';
import type {
  Profile, StrandSummary, StrandState, Member, Message, Attachment,
  SearchBatch, SearchOptions, Invitation, InvitationPreview,
  Prefs, StorageUsage, SendInput,
} from '../types';

let currentVariant: string = 'happy';
export function setMockVariant(v: string): void { currentVariant = v; }
export function getMockVariant(): string { return currentVariant; }

import strandsHappy from '../../../mock/data/Strands/happy.json';
import strandsEmpty from '../../../mock/data/Strands/empty.json';
import strandsError from '../../../mock/data/Strands/error.json';
import messagesHappy from '../../../mock/data/Messages/happy.json';
import messagesEmpty from '../../../mock/data/Messages/empty.json';
import membersHappy from '../../../mock/data/Members/happy.json';
import membersEmpty from '../../../mock/data/Members/empty.json';
import mediaHappy from '../../../mock/data/StrandMedia/happy.json';
import mediaEmpty from '../../../mock/data/StrandMedia/empty.json';
import stateHappy from '../../../mock/data/StrandState/happy.json';
import stateEmpty from '../../../mock/data/StrandState/empty.json';
import searchHappy from '../../../mock/data/Search/happy.json';
import searchEmpty from '../../../mock/data/Search/empty.json';
import invitesHappy from '../../../mock/data/Invitations/happy.json';
import invitesEmpty from '../../../mock/data/Invitations/empty.json';
import prefsHappy from '../../../mock/data/Prefs/happy.json';
import storageHappy from '../../../mock/data/StorageUsage/happy.json';
import profileHappy from '../../../mock/data/Profile/happy.json';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function fail(msg: string): never { throw new Error(msg); }
const isEmpty = () => currentVariant === 'empty';
const isError = () => currentVariant === 'error';

export class MockAdapter implements DataAdapter {
  private sent: Record<string, Message[]> = {};
  private prefs: Prefs = { ...(prefsHappy as Prefs) };
  private profile: Profile = { ...(profileHappy as Profile) };

  // ---- Strands ------------------------------------------------------------
  async listStrands(): Promise<StrandSummary[]> {
    if (isError()) fail((strandsError as any).error);
    return (isEmpty() ? strandsEmpty : strandsHappy) as StrandSummary[];
  }

  async getStrandState(_strandId: string): Promise<StrandState> {
    if (isError()) fail('Could not read this strand’s state');
    return (isEmpty() ? stateEmpty : stateHappy) as StrandState;
  }

  async listMembers(_strandId: string): Promise<Member[]> {
    if (isError()) fail('Could not load members');
    return (isEmpty() ? membersEmpty : membersHappy) as Member[];
  }

  async listMessages(strandId: string, _opts?: { before?: string; limit?: number }): Promise<Message[]> {
    if (isError()) fail('Could not reach this conversation right now');
    const base = (isEmpty() ? messagesEmpty : messagesHappy) as Message[];
    return [...base, ...(this.sent[strandId] ?? [])];
  }

  async listAttachments(_strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Attachment[]> {
    if (isError()) fail('Could not list what was shared here');
    const all = (isEmpty() ? mediaEmpty : mediaHappy) as Attachment[];
    return opts?.kind ? all.filter(a => a.type === opts.kind) : all;
  }

  // ---- Writes -------------------------------------------------------------
  async send(strandId: string, input: SendInput): Promise<Message> {
    if (isError()) fail('Could not write that message');
    const msg: Message = {
      id: `m-local-${Date.now()}`,
      memberId: 'p-bob',
      content: input.content,
      timestamp: new Date().toISOString(),
      replyToId: input.replyToId ?? null,
      editedAt: null,
      attachments: input.attachments ?? [],
      reactions: [],
    };
    (this.sent[strandId] ||= []).push(msg);
    return msg;
  }

  async editMessage(): Promise<void> { /* in place, no history */ }
  async deleteMessage(): Promise<void> { /* leaves no tombstone of our making */ }
  async react(): Promise<void> {}
  async unreact(): Promise<void> {}
  async leaveStrand(): Promise<void> {}
  async resignManager(): Promise<void> {}
  async removeMember(): Promise<void> {}

  // ---- Search -------------------------------------------------------------
  /** Streams in batches so the progressive UI has something to render. */
  async *search(_query: string, opts?: SearchOptions): AsyncIterable<SearchBatch> {
    if (isError()) fail('Search could not run');
    const src = (isEmpty() ? searchEmpty : searchHappy) as SearchBatch;
    const total = opts?.strandId ? 1 : src.strandsTotal;
    const skipped = opts?.strandId ? 0 : src.strandsSkipped;
    const hits = opts?.strandId
      ? src.results.filter(r => r.strandId === opts.strandId)
      : src.results;

    // One batch per "strand visited", so the caller can show progress.
    for (let i = 1; i <= total; i++) {
      if (opts?.signal?.aborted) return;
      await wait(120);
      const slice = hits.filter((_, idx) => idx % total === (i - 1) % total);
      yield {
        results: slice,
        strandsSearched: i,
        strandsTotal: total,
        strandsSkipped: i === total ? skipped : 0,
      };
    }
  }

  // ---- Invitations --------------------------------------------------------
  async createInvitation(input: { strandId?: string; visibility?: 'public' | 'private'; grantsInviteRight: boolean }): Promise<Invitation> {
    if (isError()) fail('Could not create an invitation');
    const token = `tok-${Math.abs(Date.now() % 1e8)}`;
    return {
      id: `i-${token}`, token,
      url: `sereus://invite/${token}`,
      qrPayload: `sereus://invite/${token}`,
      strandId: input.strandId ?? null,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      grantsInviteRight: input.grantsInviteRight,
      spent: false,
      direction: 'outgoing',
    };
  }

  async listOutstandingInvitations(): Promise<Invitation[]> {
    if (isError()) fail('Could not load invitations');
    return (isEmpty() ? invitesEmpty : invitesHappy) as unknown as Invitation[];
  }

  async cancelInvitation(): Promise<void> {}

  async inspectInvitation(_token: string): Promise<InvitationPreview> {
    if (isError()) {
      return {
        inviterName: 'Unknown', inviterAvatarUri: null,
        strandState: stateHappy as StrandState,
        grantsInviteRight: false, status: 'spent',
      };
    }
    return {
      inviterName: 'Bob', inviterAvatarUri: null,
      strandState: (isEmpty() ? stateEmpty : stateHappy) as StrandState,
      grantsInviteRight: false, status: 'live',
    };
  }

  async acceptInvitation(): Promise<{ strandId: string }> {
    if (isError()) fail('That invitation could not be used');
    return { strandId: 's-susan' };
  }

  // ---- Local scope --------------------------------------------------------
  async getProfile(): Promise<Profile> { return this.profile; }
  async saveProfile(p: Profile): Promise<void> {
    if (isError()) fail('Could not save your profile');
    this.profile = { ...p };
  }
  async getPrefs(): Promise<Prefs> { return this.prefs; }
  async setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
    this.prefs = { ...this.prefs, ...patch };
    return this.prefs;
  }
  async storageUsage(): Promise<StorageUsage> {
    if (isError()) fail('Could not measure storage');
    return storageHappy as StorageUsage;
  }
  async trimStorage(): Promise<{ bytesFreed: number }> { return { bytesFreed: 402_000_000 }; }
}
