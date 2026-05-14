/**
 * useCadreManager — state hook backing the CadreManager screen.
 *
 * Pulls cadre state out of `cadreService` and reshapes it for UI consumption.
 * Stays inside the cadre-ui module so host apps don't have to know how to
 * read cadre internals.
 *
 * Status today: a thin reader.  Future iterations will subscribe to
 * `CadreNode` events so the UI updates without a manual reload.
 */

import { useEffect, useState } from 'react';
import { cadreService } from '../cadre';

export type CadreKeyType = 'vault' | 'external' | 'dongle';
export type CadreKeyProtection = 'login' | 'biometric' | 'password';

export interface CadreKeyRow {
  id: string;
  type: CadreKeyType;
  protection: CadreKeyProtection;
  publicKey: string;
}

export type CadreNodeStatus = 'online' | 'unknown' | 'unreachable';
export type CadreDeviceType = 'phone' | 'desktop' | 'server' | 'browser' | 'other';

export interface CadreNodeRow {
  id: string;
  name: string;
  isThisDevice: boolean;
  deviceType: CadreDeviceType;
  status: CadreNodeStatus;
  peerId: string;
  source?: string;
}

export interface CadreManagerState {
  loading: boolean;
  error: string | null;
  partyId: string | null;
  peerId: string | null;
  isRunning: boolean;
  hasAuthorityKey: boolean;
  keys: CadreKeyRow[];
  nodes: CadreNodeRow[];
  /** Count of remote nodes (excludes "this device"). */
  remoteNodeCount: number;
}

const INITIAL: CadreManagerState = {
  loading: true,
  error: null,
  partyId: null,
  peerId: null,
  isRunning: false,
  hasAuthorityKey: false,
  keys: [],
  nodes: [],
  remoteNodeCount: 0,
};

export function useCadreManager(): CadreManagerState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<CadreManagerState>(INITIAL);

  const refresh = async () => {
    try {
      await cadreService.ensureStarted();
      const partyId = cadreService.partyId;
      const peerId = cadreService.peerId ?? null;
      const keys = await readKeys();
      const remoteNodes = await readRemoteNodes(peerId);
      const nodes: CadreNodeRow[] = peerId
        ? [thisDeviceRow(peerId), ...remoteNodes]
        : remoteNodes;
      setState({
        loading: false,
        error: null,
        partyId,
        peerId,
        isRunning: cadreService.isRunning,
        hasAuthorityKey: cadreService.hasAuthorityKey,
        keys,
        nodes,
        remoteNodeCount: remoteNodes.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, loading: false, error: msg }));
    }
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (!alive) return;
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refresh };
}

// ── Internal readers ───────────────────────────────────────────────────────

function thisDeviceRow(peerId: string): CadreNodeRow {
  return {
    id: peerId,
    name: 'This device',
    isThisDevice: true,
    deviceType: 'phone', // RN today; future: detect platform
    status: 'online',
    peerId,
  };
}

/**
 * Read AuthorityKey rows from the Control DB.  Returns empty until a key
 * has been created.  Errors are swallowed — the control schema may not yet
 * have populated tables on first run.
 */
async function readKeys(): Promise<CadreKeyRow[]> {
  const control = cadreService.controlDatabase;
  if (!control) return [];
  const out: CadreKeyRow[] = [];
  try {
    const db = control.getDatabase();
    for await (const row of db.eval('select Key from CadreControl.AuthorityKey')) {
      const key = String(row.Key);
      out.push({
        id: key,
        // Phase 2+: store type/protection in a per-key metadata table.  All
        // app-created keys today are vault-backed.
        type: 'vault',
        protection: 'biometric',
        publicKey: key,
      });
    }
  } catch {
    // Table may not exist yet — return empty.
  }
  return out;
}

/**
 * Read CadrePeer rows.  Excludes the local peer; the UI prepends "This
 * device" separately so it stays first regardless of CadrePeer ordering.
 */
async function readRemoteNodes(myPeerId: string | null): Promise<CadreNodeRow[]> {
  const control = cadreService.controlDatabase;
  if (!control) return [];
  const out: CadreNodeRow[] = [];
  try {
    const db = control.getDatabase();
    for await (const row of db.eval('select PeerId, Multiaddr from CadreControl.CadrePeer')) {
      const peerId = String(row.PeerId);
      if (peerId === myPeerId) continue;
      out.push({
        id: peerId,
        name: formatPeerId(peerId),
        isThisDevice: false,
        deviceType: 'other',
        status: 'unknown',
        peerId,
        source: String(row.Multiaddr ?? ''),
      });
    }
  } catch {
    // Table may not exist yet.
  }
  return out;
}

// ── Formatters ────────────────────────────────────────────────────────────

export function formatPeerId(peerId: string): string {
  if (!peerId) return '';
  return peerId.length <= 12 ? peerId : `${peerId.slice(0, 6)}…${peerId.slice(-4)}`;
}

export function formatPartyId(partyId: string | null): string {
  if (!partyId) return '—';
  return partyId.length <= 16 ? partyId : `${partyId.slice(0, 8)}…`;
}
