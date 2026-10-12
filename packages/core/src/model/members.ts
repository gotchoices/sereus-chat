import type { Result } from './result.js';

export type Member = {
  id: string;
  /** Local nickname where one exists, else the shared display name. */
  name: string;
  avatarUri?: string | null;
  isManager: boolean;
  isMe: boolean;
};

export interface MembersModel {
  list(strandId: string): Promise<Result<Member[]>>;
  remove(strandId: string, memberId: string): Promise<Result<void>>;
  resignManager(strandId: string): Promise<Result<void>>;
}
