/**
 * The profile folder: everything one serchat identity keeps, under
 * `<home>/<profile>/` (home: `--home`, else `$SERCHAT_HOME`, else `~/.serchat`).
 * Deleting the folder is a clean slate. Layout: design/specs/cli/commands.md.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** What `profile.json` holds: the node's start options, saved across runs. */
export interface ProfileConfig {
  partyId: string;
  relays: string[];
  /**
   * The loopback port `--listen` uses, chosen on first use and kept: a peer that knew this
   * profile's address finds it again next run (no relay needed on one machine).
   */
  listenPort?: number;
  createdAt: string;
}

export interface ProfileDirs {
  name: string;
  root: string;
  keys: string;
  blocks: string;
  node: string;
  slots: string;
  configFile: string;
  lastFile: string;
  historyFile: string;
}

const PROFILE_NAME = /^[A-Za-z0-9._-]{1,64}$/;

export function profileDirs(profile: string, home?: string): ProfileDirs {
  if (!PROFILE_NAME.test(profile) || profile.startsWith('.')) {
    throw new Error(`profile names are letters, digits, '.', '_' and '-': ${JSON.stringify(profile)}`);
  }
  const base = home ?? process.env.SERCHAT_HOME ?? join(homedir(), '.serchat');
  const root = join(base, profile);
  return {
    name: profile,
    root,
    keys: join(root, 'keys'),
    blocks: join(root, 'blocks'),
    node: join(root, 'node'),
    slots: join(root, 'slots'),
    configFile: join(root, 'profile.json'),
    lastFile: join(root, 'last.json'),
    historyFile: join(root, 'history'),
  };
}

/** Create the folders (owner-only), and the config on first run. Returns the config. */
export async function openProfile(dirs: ProfileDirs): Promise<{ config: ProfileConfig; created: boolean }> {
  for (const dir of [dirs.root, dirs.keys, dirs.blocks, dirs.node, dirs.slots]) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
  // The key folder holds the identity: owner-only even if it pre-existed with looser modes.
  // (No effect on Windows, where the user's profile folder is the boundary.)
  await chmod(dirs.keys, 0o700).catch(() => {});
  const existing = await readJson<ProfileConfig>(dirs.configFile);
  if (existing) return { config: existing, created: false };
  const config: ProfileConfig = { partyId: randomUUID(), relays: [], createdAt: new Date().toISOString() };
  await writeJsonAtomic(dirs.configFile, config);
  return { config, created: true };
}

export async function saveConfig(dirs: ProfileDirs, config: ProfileConfig): Promise<void> {
  await writeJsonAtomic(dirs.configFile, config);
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return JSON.parse(text) as T;
}

/** Write then rename, so a crash never leaves half a file. */
export async function writeTextAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, { mode: 0o600 });
  await rename(temp, path);
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
