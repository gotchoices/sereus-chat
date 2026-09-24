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

import type { StrandInstance, StrandRow } from '@serfab/cadre-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cadreService } from '../cadre';
import { createChatStrand, joinChatStrand } from './chat-sapp';
import { upsertMember } from './chat-operations';
import { getPrefs } from './adapter';

const PROFILE_KEY = '@sereus.chat/profile';

const DEFAULT_STRAND_ID_KEY = '@sereus.chat/defaultStrandId';

/** Strands joined through someone else's invitation — see `rememberJoinedStrand`. */
const JOINED_STRANDS_KEY = '@sereus.chat/joinedStrands';

/**
 * Exactly what `addStrand` needs to re-attach a joined strand, and nothing else.
 *
 * Structurally a `StrandRow`, declared in full — `FounderOwnerKey` included —
 * so the value can be passed straight to `joinChatStrand` with no cast. An
 * earlier version omitted that field and reached for `as unknown as StrandRow`,
 * which is precisely the move that hid the `{ name }` disclosure bug and the
 * keyless-closed-strand bug in this same file's neighbours. If this shape ever
 * stops matching, the compiler is the right thing to hear it from.
 *
 * `FounderOwnerKey` is null because a consent-seated row records no trustworthy
 * founding signer; `joinChatStrand` passes `founder: false` explicitly so
 * nothing tries to derive founder-ness from it.
 */
type JoinedStrand = {
  Id: string;
  MemberPrivateKey: string | null;
  Type: 'c' | 'o';
  FounderOwnerKey: null;
};

let cachedStrand: StrandInstance | null = null;
let inFlight: Promise<StrandInstance> | null = null;

/**
 * Boot the cadre, attach the default chat strand (creating one on first run),
 * and ensure this device is registered as a Member.  Idempotent — repeated
 * calls return the same StrandInstance.
 *
 * App boot and the first `listStrands()` fire this concurrently; the in-flight
 * guard collapses them into one attach instead of racing two `createChatStrand`
 * calls on the same strandId.
 */
/**
 * Configure the node with every relay the user has accepted.
 *
 * MUST run BEFORE the node starts, not after: relays are named at construction
 * (`network.relayAddrs`), which is the only path that reaches this machine's
 * strand nodes as well as its control node. Applying them afterwards would make
 * `applyRelays` rebuild a node we had just built.
 *
 * Stored in prefs rather than on the node, because a reservation lives with the
 * running node and does not survive a restart — without this the app would come
 * back from a cold start silently unreachable while still listing the relay
 * under "how you are reachable".
 */
export async function applySavedRelays(): Promise<void> {
  const { relayAddrs } = await getPrefs();
  if (!relayAddrs?.length) return;
  await cadreService.applyRelays(relayAddrs);
}

export async function ensureDefaultChatStrand(): Promise<StrandInstance> {
  if (cachedStrand?.database) return cachedStrand;
  if (inFlight) return inFlight;

  inFlight = doEnsureDefaultChatStrand().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doEnsureDefaultChatStrand(): Promise<StrandInstance> {
  if (cachedStrand?.database) return cachedStrand;

  // BEFORE the node starts, every time — not only from App's boot effect.
  // `listStrands()` kicks this off in the background as the strand list renders,
  // which races that effect; whichever gets here first would otherwise build a
  // node with no relays and force `applyRelays` to rebuild it a moment later.
  // Idempotent, so the boot effect calling it too costs nothing.
  await applySavedRelays();
  await cadreService.ensureStarted();
  const node = cadreService.cadreNode;
  if (!node) throw new Error('CadreNode not running');

  const strandId = await getOrCreateDefaultStrandId();
  let strand = node.getStrands().get(strandId) ?? null;

  if (!strand) {
    console.info('[chat-strand] creating default chat strand:', strandId);
    // CLOSED, like every other chat strand. This one is the user's own to begin
    // with, so the gate is moot today — but a strand's type is fixed at founding,
    // and "invite someone into this conversation" is a thing the app offers. An
    // open strand could never honour that invitation, and there is no later act
    // that closes it.
    const created = await createChatStrand(node, strandId, 'private');
    strand = created.instance;
    console.info(
      '[chat-strand] ✓ default chat strand attached. status:',
      strand.status,
      ' database:',
      !!strand.database,
    );
  }

  await registerSelfAsMember(strand);

  cachedStrand = strand;
  return strand;
}

/**
 * Idempotent self-registration as a Member of `strand`.
 *
 * EVERY strand we attach, not just the one we founded.  A strand we JOINED used
 * to get no `App.Member` row for us at all: registration lived inline in the
 * default-strand path, and the only other writer was `saveProfile`.  So unless a
 * joiner happened to edit their profile afterwards, they were a participant that
 * the conversation had no record of — their own strand-details screen listed
 * only the other party, and their messages rendered with no name behind them.
 *
 * Failure is logged, not thrown: not being listed yet is a smaller harm than a
 * join that reports itself as failed after it actually succeeded.
 */
export async function registerSelfAsMember(strand: StrandInstance): Promise<void> {
  const peerId = cadreService.peerId;
  if (!peerId) return;
  try {
    // The local profile name, or a truncated peer id until they enter one.
    const name = await readProfileDisplayName(peerId);
    await upsertMember(strand, peerId, name);
  } catch (err) {
    console.warn('[chat-strand] self-registration failed for', strand.strandId, err);
  }
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

/** Lightweight UUID v4 using crypto.getRandomValues (polyfilled in polyfills/hermes.js). */
export function generateUuid(): string {
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

/**
 * Attach every strand the control network offers that we are not already running.
 *
 * WHY THIS IS NOT OPTIONAL. When someone accepts our invitation, the formation
 * responder CREATES the strand on this machine's behalf and writes its row — but
 * it does not launch it. Nothing else does either, so without this the host holds
 * a strand it never runs, and the joiner, whose side completed perfectly, waits
 * out `StrandAwaitingFirstSyncError`: "no member of this strand has been
 * reachable since this machine joined". The host is the missing member, and it is
 * sitting right there.
 *
 * ORDER MATTERS, and cadre-core is explicit about it: the StrandWatcher offers
 * every stored strand ~100 ms after `start()`, records them as seen, and never
 * re-offers them. So subscribe FIRST, then drain `getDiscoveredStrands()`. Doing
 * it the other way round loses any strand that arrives between the two steps —
 * permanently, for the life of the process. In this order a strand can instead be
 * handled TWICE, which is why the handler below is idempotent.
 *
 * The in-flight set is load-bearing for the same reason: the strand manager only
 * tracks an instance once `addStrand` has RESOLVED, so two overlapping attaches
 * of one strand would both see it as absent and both proceed.
 */
const attaching = new Set<string>();

async function attachDiscoveredStrand(strandId: string, strandRow: StrandRow): Promise<void> {
  const node = cadreService.cadreNode;
  if (!node) return;
  if (attaching.has(strandId) || node.getStrands().has(strandId)) return;

  // Never the default strand: `ensureDefaultChatStrand` owns that one and founds
  // it through `foundStrand`. The watcher offers it too (it is a stored strand
  // like any other), and the `getStrands()` check above loses the race when the
  // offer lands mid-founding — which is how this ended up attaching the same
  // strand twice on every launch, once as founder and once as joiner.
  const defaultId = await AsyncStorage.getItem(DEFAULT_STRAND_ID_KEY);
  if (defaultId === strandId) return;

  attaching.add(strandId);
  try {
    // `deriveFounder`: this row came from the CONTROL NETWORK, so it carries a real
    // `FounderOwnerKey` — and a strand THIS device founded arrives here after a
    // restart, not through the remembered-joins list. Forcing `founder: false`
    // told cadre-core we were a joiner of our own strand, which skips the founding
    // membership bootstrap.
    const instance = await joinChatStrand(node, strandRow, { deriveFounder: true });
    // Also here, not only on the join and re-attach paths. A strand this device
    // FOUNDED comes back through discovery after a restart, not through the
    // remembered-joins list, so this is where such a strand gets its self Member
    // row if it is missing one — including strands founded before the founding
    // path registered at all, which are otherwise permanently unable to send.
    await registerSelfAsMember(instance);
    console.info('[chat-strand] ✓ attached discovered strand:', strandId);
  } catch (err) {
    // Best-effort on purpose: a strand we cannot attach now (no peer reachable
    // yet, storage busy) is re-offered by the watcher on a later poll, and one
    // failure must not stop the others in the drain below.
    console.warn('[chat-strand] attach of discovered strand failed:', strandId, err);
  } finally {
    attaching.delete(strandId);
  }
}

/** Idempotent — safe to call on every app start. */
export async function watchDiscoveredStrands(): Promise<void> {
  await cadreService.ensureStarted();
  const node = cadreService.cadreNode;
  if (!node) return;

  // Subscribe first …
  cadreService.on('strand:discovered', ({ strandId, strand }) => {
    void attachDiscoveredStrand(strandId, strand);
  });

  // … then drain what was offered before we were listening.
  for (const [strandId, strandRow] of node.getDiscoveredStrands()) {
    void attachDiscoveredStrand(strandId, strandRow);
  }
}

async function readJoinedStrands(): Promise<JoinedStrand[]> {
  try {
    const raw = await AsyncStorage.getItem(JOINED_STRANDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // NORMALISED, not cast. This list is read back from storage written by an
    // OLDER build of this app — entries predating `FounderOwnerKey` carry no
    // such field, and a bare `as JoinedStrand[]` would tell the compiler
    // otherwise while handing `undefined` to cadre-core at runtime. Anything
    // without an `Id` is not a strand record at all and is dropped.
    return parsed
      .filter((row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && typeof (row as { Id?: unknown }).Id === 'string')
      .map(row => ({
        Id: row.Id as string,
        MemberPrivateKey: typeof row.MemberPrivateKey === 'string' ? row.MemberPrivateKey : null,
        Type: row.Type === 'o' ? 'o' as const : 'c' as const,
        FounderOwnerKey: null,
      }));
  } catch {
    // A corrupt entry must not brick startup — the strands are still on disk and
    // a later successful join rewrites the list.
    return [];
  }
}

/**
 * Record a strand this device joined, so a restart can get back into it.
 *
 * NOTHING ELSE REMEMBERS THESE. `addStrand` is the attach half only and never
 * publishes the `Strand` row — correct for a joiner, since cadre-core expects a
 * joiner's row to have arrived over its own control network. Across PARTIES it
 * never does: the host publishes into its own cadre, and this device is not in
 * it. So without this list, a restart loses the strand outright — no row, nothing
 * for the StrandWatcher to offer, no `strand:discovered`, no way back short of a
 * fresh invitation.
 *
 * `MemberPrivateKey` is what makes that urgent rather than untidy: the closed
 * strand's read-gating secret, handed over exactly once in the formation result
 * and written to neither side's control DB. Lose it and the conversation cannot
 * be reopened by anyone, ever — a fresh invitation mints a new membership, it
 * does not recover the old one.
 *
 * `reference-app-rn` does not do this; it holds joined strands in React state
 * and loses them on restart, which is fine for a demo and not for a messenger.
 * Upstream tracks the wider problem as `feat-cross-party-strand-addr-durability`;
 * when that lands, re-read this — the id and key stay ours to keep, but the
 * re-attach loop may not be.
 *
 * Called on the ACCEPT path as soon as formation returns, BEFORE the attach is
 * awaited. Deliberate: `addStrand` rejects with `StrandAwaitingFirstSyncError`
 * when no member is reachable yet, and that is a retryable, strand-stays-launched
 * outcome — not a reason to forget a membership we genuinely hold. Recording
 * after a successful attach would drop exactly the memberships that most need
 * retrying.
 */
export async function rememberJoinedStrand(row: JoinedStrand): Promise<void> {
  const list = await readJoinedStrands();
  const next = [...list.filter(s => s.Id !== row.Id), row];
  await AsyncStorage.setItem(JOINED_STRANDS_KEY, JSON.stringify(next));
}

/**
 * Re-attach every remembered strand. Idempotent; safe on every start.
 *
 * Failures are per-strand and non-fatal: one unreachable host must not stop the
 * others, and `StrandAwaitingFirstSyncError` in particular means the strand IS
 * launched and still trying, so it is logged at info rather than as a fault.
 */
export async function attachJoinedStrands(): Promise<void> {
  const remembered = await readJoinedStrands();
  if (!remembered.length) return;

  await cadreService.ensureStarted();
  const node = cadreService.cadreNode;
  if (!node) return;

  for (const row of remembered) {
    if (attaching.has(row.Id) || node.getStrands().has(row.Id)) continue;
    attaching.add(row.Id);
    try {
      const instance = await joinChatStrand(node, row);
      await registerSelfAsMember(instance);
      console.info('[chat-strand] ✓ re-attached joined strand:', row.Id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const awaitingSync = err instanceof Error && err.name === 'StrandAwaitingFirstSyncError';
      console[awaitingSync ? 'info' : 'warn'](
        `[chat-strand] ${awaitingSync ? 'joined strand launched, awaiting first sync' : 'could not re-attach joined strand'}: ${row.Id} — ${message}`,
      );
    } finally {
      attaching.delete(row.Id);
    }
  }
}
