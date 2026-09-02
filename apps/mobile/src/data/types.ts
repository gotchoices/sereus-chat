// Domain types — see design/specs/domain/ops.md and schema.md.
// Anything absent here is absent deliberately: there is no delivery or read
// status anywhere in this app, and none is tracked.

export type Muted = 'none' | 'soft' | 'hard';
export type Locality = 'local' | 'fetching' | 'unreachable';
export type Visibility = 'public' | 'private';

export type Profile = {
  name: string;
  avatarUri?: string | null;
  // Device-local only; never shared into a strand.
  email?: string;
  phone?: string;
  notes?: string;
};

export type StrandSummary = {
  id: string;
  title: string;
  avatarUri?: string | null;
  isGroup: boolean;
  memberCount: number;
  lastMessage?: {
    previewText: string;
    /** null in strands of two — the row omits the prefix. */
    senderName: string | null;
    timestamp: string;
  } | null;
  unreadCount: number;
  mentioned: boolean;
  muted: Muted;
  /** Device-local. An unsent draft never leaves the phone. */
  draftPreview: string | null;
  archived: boolean;
  pending: boolean;
};

/**
 * Derived from recorded state only — never from activity or silence.
 * settled === (visibility === 'private' && managerCount === 0)
 */
export type StrandState = {
  visibility: Visibility;
  managerCount: number;
  settled: boolean;
  canIManage: boolean;
};

export type Member = {
  id: string;
  /** Local nickname where one exists, else the shared display name. */
  name: string;
  avatarUri?: string | null;
  isManager: boolean;
  isMe: boolean;
};

export type Reaction = { memberId: string; symbol: string };

export type Attachment = {
  id: string;
  messageId?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  /** null does NOT mean absent — check `locality`. */
  uri: string | null;
  mimeType?: string;
  name?: string;
  byteSize?: number | null;
  durationMs?: number | null;
  locality: Locality;
};

export type Message = {
  id: string;
  memberId: string;
  content: string;
  timestamp: string;
  replyToId: string | null;
  editedAt: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
};

export type SearchHit = {
  strandId: string;
  strandTitle: string;
  messageId: string;
  senderName: string;
  snippet: string;
  matchRange: [number, number];
  timestamp: string;
};

export type SearchBatch = {
  results: SearchHit[];
  strandsSearched: number;
  strandsTotal: number;
  strandsSkipped: number;
};

export type SearchOptions = {
  strandId?: string;
  kinds?: Array<Attachment['type'] | 'text'>;
  from?: string;
  to?: string;
  senderId?: string;
  signal?: AbortSignal;
};

export type Invitation = {
  id: string;
  token: string;
  url: string;
  qrPayload: string;
  strandId: string | null;
  expiresAt: string | null;
  grantsInviteRight: boolean;
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

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  language: string;
  notifyDefault: 'all' | 'mentions' | 'none';
  storageCeilingBytes: number | null;
  perStrandOverrides: number;
};

export type StorageUsage = {
  totalBytes: number;
  byStrand: Array<{ strandId: string; title: string; bytes: number }>;
};

export type SendInput = {
  content: string;
  attachments?: Attachment[];
  replyToId?: string | null;
};
