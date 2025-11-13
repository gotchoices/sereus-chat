/* AppeusMeta:
{
  "dependsOn": [
    "design/generated/api/Messages.md"
  ]
}
*/
export type ChatMessage = {
  id: string;
  threadId: string;
  sender: string;
  text: string;
  timestamp: string | null;
  outgoing?: boolean;
};

import happy from '../../mock/data/Messages/happy.json';
import empty from '../../mock/data/Messages/empty.json';

export async function listMessages(threadId: string, variant: 'happy' | 'empty' | 'error' = 'happy'): Promise<ChatMessage[]> {
  if (!threadId) return [];
  if (variant === 'empty') return (empty as ChatMessage[]).filter(m => m.threadId === threadId);
  const data = (happy as ChatMessage[]).filter(m => m.threadId === threadId);
  return data;
}


