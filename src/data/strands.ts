/* AppeusMeta:
{
  "dependsOn": [
    "design/generated/api/Strands.md"
  ]
}
*/
export type StrandSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  lastMessage?: { previewText: string; timestamp: string | null } | null;
  unreadCount: number;
};

// Simple static imports for variants. Later this can fetch from the mock server.
import happy from '../../mock/data/Strands/happy.json';
import empty from '../../mock/data/Strands/empty.json';
import errorObj from '../../mock/data/Strands/error.json';

export async function listStrands(variant: 'happy' | 'empty' | 'error' = 'happy'): Promise<StrandSummary[]> {
  if (variant === 'empty') return empty as StrandSummary[];
  if (variant === 'error') throw new Error((errorObj as any).error || 'Mock error');
  return happy as StrandSummary[];
}


