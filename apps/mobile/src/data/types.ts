// Domain types — see design/specs/domain/ops.md and schema.md.
// Anything absent here is absent deliberately: there is no delivery or read
// status anywhere in this app, and none is tracked.

// The shapes now live in the core's model (packages/core/src/model); re-exported so
// the app's imports keep working until screens bind to core stores (Phase 6).
export type {
  Muted, Locality, Visibility, Profile, StrandSummary, StrandState, Member, Reaction,
  Attachment, Message, SearchHit, SearchBatch, SearchOptions, Invitation, InvitationPreview,
  Prefs, StorageUsage, SendInput, InvitationValidity,
} from '@chat/core';
export { INVITATION_VALIDITY, defaultInvitationTerms } from '@chat/core';
