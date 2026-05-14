/**
 * chat-strand.ts — default chat strand lifecycle.
 *
 * The "default strand" is a single chat strand that the app auto-creates on
 * first run so the user has somewhere to write before any partner strand has
 * been formed.  Its id is persisted in AsyncStorage; subsequent launches
 * reattach the same strand.
 *
 * Boundary: this file is chat-specific; it composes the cadre engine
 * (`cadreService`) with chat-side helpers (`createChatStrand`,
 * `insertMember`).
 */

import type { StrandInstance } from '@serfab/cadre-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cadreService } from '../cadre';
import { createChatStrand } from './chat-sapp';
import { upsertMember } from './chat-operations';

const PROFILE_KEY = '@sereus.chat/profile';

const DEFAULT_STRAND_ID_KEY = '@sereus.chat/defaultStrandId';

let cachedStrand: StrandInstance | null = null;

/**
 * Boot the cadre, attach the default chat strand (creating one on first run),
 * and ensure this device is registered as a Member.  Idempotent — repeated
 * calls return the same StrandInstance.
 */
export async function ensureDefaultChatStrand(): Promise<StrandInstance> {
  if (cachedStrand?.database) return cachedStrand;

  await cadreService.ensureStarted();
  const node = cadreService.cadreNode;
  if (!node) throw new Error('CadreNode not running');

  const strandId = await getOrCreateDefaultStrandId();
  let strand = node.getStrands().get(strandId) ?? null;

  if (!strand) {
    console.info('[chat-strand] creating default chat strand:', strandId);
    strand = await createChatStrand(node, strandId);
    console.info(
      '[chat-strand] ✓ default chat strand attached. status:',
      strand.status,
      ' database:',
      !!strand.database,
    );
  }

  // Idempotent self-registration as a Member of this strand.  Pull the
  // display name from the local profile; fall back to a truncated peer id
  // until the user enters one.
  const peerId = cadreService.peerId;
  if (peerId) {
    try {
      const name = await readProfileDisplayName(peerId);
      await upsertMember(strand, peerId, name);
    } catch (err) {
      console.warn('[chat-strand] upsertMember failed:', err);
    }
  }

  cachedStrand = strand;
  return strand;
}

/**
 * Push the local profile name to App.Member across every attached strand.
 * Called from SereusAdapter.saveProfile so the rename propagates immediately.
 */
export async function syncProfileNameToStrands(): Promise<void> {
  const peerId = cadreService.peerId;
  if (!peerId) return;
  const name = await readProfileDisplayName(peerId);
  for (const strand of cadreService.getStrands().values()) {
    if (!strand.database) continue;
    try {
      await upsertMember(strand, peerId, name);
    } catch (err) {
      console.warn('[chat-strand] sync to strand', strand.strandId, 'failed:', err);
    }
  }
}

async function readProfileDisplayName(peerIdFallback: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (raw) {
      const profile = JSON.parse(raw) as { name?: string };
      const trimmed = profile?.name?.trim();
      if (trimmed) return trimmed;
    }
  } catch {
    // fall through
  }
  return peerIdFallback.slice(0, 12);
}

/** Return the default strand if it's been attached; null otherwise. */
export function getDefaultChatStrand(): StrandInstance | null {
  return cachedStrand;
}

// ───────────────────────────────────────────────────────────────────────────

async function getOrCreateDefaultStrandId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEFAULT_STRAND_ID_KEY);
  if (existing) return existing;
  const id = generateUuid();
  await AsyncStorage.setItem(DEFAULT_STRAND_ID_KEY, id);
  return id;
}

/** Lightweight UUID v4 using crypto.getRandomValues (polyfilled in index.js). */
function generateUuid(): string {
  const bytes = new Uint8Array(16);
  const g = globalThis as Record<string, unknown>;
  const c = (g.crypto ?? {}) as { getRandomValues?: (buf: Uint8Array) => void };
  if (typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
