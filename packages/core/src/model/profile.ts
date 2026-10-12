import type { Result } from './result.js';

export type Profile = {
  name: string;
  avatarUri?: string | null;
  // Device-local only; never shared into a strand.
  email?: string;
  phone?: string;
  notes?: string;
};

export interface ProfileModel {
  get(): Promise<Result<Profile>>;
  save(profile: Profile): Promise<Result<void>>;
}
