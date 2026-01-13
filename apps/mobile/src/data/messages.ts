/* AppeusMeta:
{
  "dependsOn": [
    "design/generated/api/Messages.md"
  ]
}
*/
export type ChatMessage = {
  id: string;
  strandId: string;
  sender: string;
  text: string;
  timestamp: string | null;
  outgoing?: boolean;
};

import happy from '../../mock/data/Messages/happy.json';
import empty from '../../mock/data/Messages/empty.json';

export async function listMessages(strandId: string, variant: 'happy' | 'empty' | 'error' = 'happy'): Promise<ChatMessage[]> {
  if (!strandId) return [];
  if (variant === 'empty') return (empty as ChatMessage[]).filter(m => m.strandId === strandId);
  const data = (happy as ChatMessage[]).filter(m => m.strandId === strandId);
  return data;
}


