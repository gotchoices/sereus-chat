export type ProvisionalAttachment = {
  id: string;
  type: 'image' | 'video' | 'file' | 'location';
  uri?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  thumbnailUri?: string;
  location?: { lat: number; lon: number; label?: string };
};

let pending: ProvisionalAttachment | null = null;

export function setPendingAttachment(att: ProvisionalAttachment | null) {
  pending = att;
}

export function consumePendingAttachment(): ProvisionalAttachment | null {
  const p = pending;
  pending = null;
  return p;
}


