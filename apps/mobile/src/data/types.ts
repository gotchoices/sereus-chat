// Domain types matching specs/domain/schema.md

export type Profile = {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  avatarUri?: string | null;
};

export type StrandSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  lastMessage?: { previewText: string; timestamp: string | null } | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  strandId: string;
  sender: string;  // Maps to senderId in schema; "Me" for outgoing
  text: string;
  timestamp: string | null;
  outgoing?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  attachments?: Attachment[];
};

export type Attachment = {
  id: string;
  type: 'image' | 'video' | 'file' | 'location';
  uri?: string;
  mimeType?: string;
  name?: string;
};

export type Invitation = {
  token: string;
  strandId?: string;
  createdAt: string;
  expiresAt?: string;
};

