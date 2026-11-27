/**
 * One sereus node in Node, with nothing of sereus-chat in it: file storage, loopback WebSockets,
 * an owner, and a strand of a tiny sApp founded on it. For reproductions meant to go upstream.
 *
 *   const { node, strand, stop } = await soloStrand('repro', 'table T (Id text primary key)');
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { webSockets } from '@libp2p/websockets';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { fileNodeStorage } from '@optimystic/db-p2p-storage-fs';

export const SAPP_ID = 'org.example.repro';

/** A started node with an owner, and one strand of an sApp whose schema is `ddl`. */
export async function soloStrand(tag, ddl) {
  const dir = mkdtempSync(join(tmpdir(), `${tag}-`));
  const partyId = `${tag}-${randomUUID()}`;
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    nodeClass: 'device',
    storage: { open: async scope => { const st = fileNodeStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    network: { transports: [webSockets()], listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
    strandFilter: { mode: 'sAppId', sAppId: SAPP_ID },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
  });
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore, label: tag });
  if (genesis !== 'enrolled') throw new Error(`${tag}: owner genesis ${genesis}`);
  const stop = async () => {
    await node.stop().catch(() => {});
    await Promise.allSettled(built.map(st => st.close?.()));
    rmSync(dir, { recursive: true, force: true });
  };
  const sAppConfig = { id: SAPP_ID, version: '1.0.0', schema: ddl, signature: '', schemaVersion: 1, latencyHint: 'interactive' };
  try {
    const founded = await node.foundStrand({
      strandId: `strand-${randomUUID()}`, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig,
    });
    return { node, strand: founded.instance, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** Versions of the packages in play, for a report. */
export async function versions() {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../node_modules/', import.meta.url));
  const v = name => { try { return JSON.parse(readFileSync(`${root}${name}/package.json`, 'utf8')).version; } catch { return '?'; } };
  return ['@serfab/cadre-core', '@serfab/quereus-plugin-sereus', '@optimystic/db-p2p', '@optimystic/quereus-plugin-optimystic', '@quereus/quereus']
    .map(n => `${n} ${v(n)}`).join(', ');
}
