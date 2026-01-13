export type Profile = {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string | null;
};

import happy from '../../mock/data/Profile/happy.json';
import empty from '../../mock/data/Profile/empty.json';

export async function loadProfile(variant: 'happy' | 'empty' = 'happy'): Promise<Profile> {
  if (variant === 'empty') return (empty as Profile) || { name: '' };
  return (happy as Profile) || { name: 'User' };
}

// No-op in mock/demo mode; writes will be enabled with the engine
export async function saveProfile(_p: Profile): Promise<void> {
  return;
}


