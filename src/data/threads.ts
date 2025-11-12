/* AppeusMeta:
{
  "dependsOn": [
    "design/generated/api/Threads.md"
  ]
}
*/
export type ThreadSummary = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  lastMessage?: { previewText: string; timestamp: string | null } | null;
  unreadCount: number;
};

// Simple static imports for variants. Later this can fetch from the mock server.
import happy from '../../mock/data/Threads/happy.json';
import empty from '../../mock/data/Threads/empty.json';
import errorObj from '../../mock/data/Threads/error.json';

export async function listThreads(variant: 'happy' | 'empty' | 'error' = 'happy'): Promise<ThreadSummary[]> {
  if (variant === 'empty') return empty as ThreadSummary[];
  if (variant === 'error') throw new Error((errorObj as any).error || 'Mock error');
  return happy as ThreadSummary[];
}


