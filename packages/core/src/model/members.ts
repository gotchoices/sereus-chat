import type { Result } from './result.js';

export type Member = {
  id: string;
  /** The user's own name for them (`nickname`) where one exists, else the shared display name. */
  name: string;
  /** The name they gave themselves, shared with the strand. */
  ownName: string;
  /** The user's private name for them, if any: never shown to anyone else. */
  nickname?: string | null;
  avatarUri?: string | null;
  isManager: boolean;
  isMe: boolean;
};

export interface MembersModel {
  list(strandId: string): Promise<Result<Member[]>>;
  remove(strandId: string, memberId: string): Promise<Result<void>>;
  resignManager(strandId: string): Promise<Result<void>>;
  /**
   * Give a member a private name of the user's own (story 30), or remove it (`null`). It reaches
   * only the user's own machines. The app never decides two members are the same person: using
   * one name in several strands is the user's own filing.
   */
  setNickname(strandId: string, memberId: string, name: string | null, opts?: { everywhere?: boolean }): Promise<Result<void>>;
  /** The private names in use, for choosing one again. */
  nicknames(): Promise<Result<string[]>>;
  /**
   * How many members (in any strand) the user has given this name. With `everywhere`,
   * `setNickname` renames all of them, not only the one member (story 30).
   */
  nicknameUses(name: string): Promise<Result<number>>;
}
