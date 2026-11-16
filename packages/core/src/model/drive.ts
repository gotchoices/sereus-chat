import type { Result } from './result.js';

/** How long an added file is kept (story 23): its author chooses; anyone can keep it longer. */
export type KeepFor = 'day' | 'week' | 'month' | 'year';

/** Who may add in a folder: any member, or only the member who made it. */
export type AddPolicy = 'anyone' | 'creator';

export type DriveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  createdBy: string;
  /** The creator's name as this device shows it (a private name if one is set). */
  createdByName: string;
  createdAt: string;
  addPolicy: AddPolicy;
  /** The viewer made it: may rename, move and remove it, and choose who adds in it. */
  mine: boolean;
  /** The viewer may add files and folders in it. */
  canAdd: boolean;
};

export type DriveFile = {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  mimeType: string | null;
  addedBy: string;
  addedByName: string;
  addedAt: string;
  /** After this it is gone from the drive, for everyone. */
  expiresAt: string;
  /** A short code that tells same-named files apart. */
  fingerprint: string;
  /** The viewer added it: may rename, move and remove it. */
  mine: boolean;
  /** Its bytes are on this device (`uri`); otherwise `open` fetches them. */
  here: boolean;
  uri: string | null;
};

export type DriveListing = {
  /** The folder listed; null for the top of the drive. */
  folder: DriveFolder | null;
  /** From the top down to the folder listed, not including it. */
  path: DriveFolder[];
  /** The viewer may add here. */
  canAdd: boolean;
  folders: DriveFolder[];
  files: DriveFile[];
};

/** A strand's shared drive (story 23; `@chat/strand-drive`). */
export interface DriveModel {
  /** The folders and files directly in a folder (or at the top, with no folder). */
  list(strandId: string, folderId?: string | null): Promise<Result<DriveListing>>;
  addFolder(strandId: string, parentId: string | null, name: string, opts?: { addPolicy?: AddPolicy }): Promise<Result<DriveFolder>>;
  /** Add a file from this device (`uri`), kept for `keepFor` (default a month). Fails `too-large` over the user's limit. */
  addFile(strandId: string, folderId: string | null, file: { uri: string; name: string; mimeType?: string; keepFor?: KeepFor }): Promise<Result<DriveFile>>;
  /** The file's bytes on this device, fetched from the strand if needed; `unavailable` (`still-arriving`) while not reachable. */
  open(strandId: string, fileId: string): Promise<Result<{ uri: string }>>;
  rename(strandId: string, kind: 'folder' | 'file', id: string, name: string): Promise<Result<void>>;
  move(strandId: string, kind: 'folder' | 'file', id: string, to: string | null): Promise<Result<void>>;
  /** Keep a file at least `keepFor` from now (any member). */
  keep(strandId: string, fileId: string, keepFor: KeepFor): Promise<Result<DriveFile>>;
  /** Remove from the drive (copies others already have are out of reach). */
  remove(strandId: string, kind: 'folder' | 'file', id: string): Promise<Result<void>>;
  setAddPolicy(strandId: string, folderId: string, policy: AddPolicy): Promise<Result<void>>;
}
