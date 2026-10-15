import type { StrandState, Visibility } from './strands.js';
import type { Result } from './result.js';

export type Invitation = {
  id: string;
  token: string;
  url: string;
  qrPayload: string;
  strandId: string | null;
  expiresAt: string | null;
  grantsInviteRight: boolean;
  /**
   * For one person (spent on first use) or for anyone holding the link until it
   * expires. Absent on invitations remembered by older builds; read as true.
   */
  singleUse?: boolean;
  /** How many have joined through it, when known (outstanding invitations only). */
  uses?: number;
  spent: boolean;
  direction?: 'outgoing' | 'incoming';
  label?: string;
};

export type InvitationPreview = {
  inviterName: string;
  inviterAvatarUri: string | null;
  strandState: StrandState;
  grantsInviteRight: boolean;
  status: 'live' | 'spent' | 'expired' | 'cancelled' | 'invalid';
};

export type CreateInvitationInput = {
  strandId?: string;
  visibility?: Visibility;
  grantsInviteRight: boolean;
  /** One person (default) or anyone with the link. */
  singleUse?: boolean;
  /** How long it stays good, ms. Default one week. */
  validForMs?: number;
};

/** How long an invitation stays good: the choices the generator offers (story 02). */
export const INVITATION_VALIDITY = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;
export type InvitationValidity = keyof typeof INVITATION_VALIDITY;

/**
 * Story 02's defaults by strand kind: a private strand's invitation is for one person
 * and good for a week; an open strand's is for anyone with the link and good for a
 * month.
 */
export function defaultInvitationTerms(visibility: Visibility): { singleUse: boolean; validity: InvitationValidity } {
  return visibility === 'public'
    ? { singleUse: false, validity: 'month' }
    : { singleUse: true, validity: 'week' };
}

export interface InvitationsModel {
  /**
   * Start founding a conversation of this kind in the background, for the next `create`
   * without a `strandId`, while the person is still choosing its terms. At most one is kept
   * per kind, across restarts, and it is not listed until an invitation into it is made.
   * Never fails: a failed preparation leaves `create` to found as it always has.
   */
  prepare(visibility: Visibility): void;
  /** Fails with `unreachable` when nobody could answer it yet (story 02 Alt A). */
  create(input: CreateInvitationInput): Promise<Result<Invitation>>;
  listOutstanding(): Promise<Result<Invitation[]>>;
  /** Stops LISTING it; does not withdraw it. */
  cancel(id: string): Promise<Result<void>>;
  /** Read an invitation without redeeming it. */
  inspect(token: string): Promise<Result<InvitationPreview>>;
  accept(token: string): Promise<Result<{ strandId: string }>>;
}
