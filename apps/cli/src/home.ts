/**
 * The profile folder: everything one serchat identity keeps, under
 * `<home>/<profile>/` (home: `--home`, else `$SERCHAT_HOME`, else `~/.serchat`).
 * Deleting the folder is a clean slate. Layout: design/specs/cli/commands.md.
 */
import { unlinkSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * The form of everything a profile stores. Bump it when a stack upgrade or a change here
 * makes older profiles unreadable (sereus 1.17 refuses control stores written by 1.16 or
 * earlier, and keeps the owner key apart from the identity). A profile in another form is
 * refused, never misread.
 */
export const DATA_FORMAT = 'sereus-1.17';

/** What `profile.json` holds: the node's start options, saved across runs. */
export interface ProfileConfig {
  /** `DATA_FORMAT` when the profile was made; absent in profiles from before it existed. */
  dataFormat?: string;
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
  lockFile: string;
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
    lockFile: join(root, 'lock'),
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
  if (existing) {
    if (existing.dataFormat !== DATA_FORMAT) {
      throw new Error(`profile ${dirs.name} was made in an older form (${existing.dataFormat ?? 'before formats were recorded'}) `
        + `that this serchat (${DATA_FORMAT}) cannot read. Delete ${dirs.root} to start it again.`);
    }
    return { config: existing, created: false };
  }
  const config: ProfileConfig = { dataFormat: DATA_FORMAT, partyId: randomUUID(), relays: [], createdAt: new Date().toISOString() };
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

/**
 * One process per profile: two nodes over the same files would corrupt them. Takes the
 * profile's lock file (holding this process's id) or throws naming the holder; a lock
 * left by a process that no longer runs is taken over. Released when this process exits.
 */
export async function lockProfile(dirs: ProfileDirs): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(dirs.lockFile, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
      process.on('exit', () => { try { unlinkSync(dirs.lockFile); } catch { /* already gone */ } });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const holder = Number((await readFile(dirs.lockFile, 'utf8').catch(() => '')).trim());
      if (holder && holder !== process.pid && isRunning(holder)) {
        throw new Error(`profile ${dirs.name} is in use by process ${holder}`);
      }
      // Stale: its process is gone. Remove it and try once more.
      try { unlinkSync(dirs.lockFile); } catch { /* raced with another taker */ }
    }
  }
  throw new Error(`profile ${dirs.name} is in use`);
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
