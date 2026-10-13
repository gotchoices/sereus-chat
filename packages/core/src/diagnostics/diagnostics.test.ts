import { describe, expect, it } from 'vitest';
import { formatLoopLag, runCryptoCost, startLoopLag } from './index.js';

describe('diagnostics', () => {
  it('measures the crypto a connection pays for, WebCrypto Ed25519 included in Node', async () => {
    const report = await runCryptoCost();
    const labels = report.measurements.map(m => m.label);
    expect(labels).toContain('x25519 shared secret');
    expect(labels).toContain('ed25519 verify (WebCrypto)'); // Node 22 has WebCrypto Ed25519
    for (const m of report.measurements) expect(m.msPerOp).toBeGreaterThan(0);
  });

  it('reports loop lag on its interval', async () => {
    const reports: string[] = [];
    const stop = startLoopLag(r => reports.push(formatLoopLag(r)), { tickMs: 10, reportMs: 60 });
    await new Promise(r => setTimeout(r, 200));
    stop();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]).toMatch(/^worst \d+ ms late/);
  });
});

describe('found strand', () => {
  it('founds one strand on one node, in memory', async () => {
    const { runFoundStrandCheck } = await import('./index.js');
    const { MemoryRawStorage } = await import('@optimystic/db-p2p');
    const { webSockets } = await import('@libp2p/websockets');
    const { generateKeyPair } = await import('@libp2p/crypto/keys');
    const result = await runFoundStrandCheck({
      storage: () => new MemoryRawStorage(),
      transports: [webSockets()] as never,
      privateKey: await generateKeyPair('Ed25519'),
    }, { timeoutMs: 60_000 });
    expect(result.converged, result.log.join('\n')).toBe(true);
  }, 90_000);
});

describe('two-party check', () => {
  it('two relay-only parties in one process form a strand and replicate', async () => {
    const { runTwoPartyCheck } = await import('./index.js');
    const { startRelay } = await import('../testing/node-host.js');
    const { CadreNode } = await import('@serfab/cadre-core');
    const { MemoryRawStorage } = await import('@optimystic/db-p2p');
    const { webSockets } = await import('@libp2p/websockets');
    const { circuitRelayTransport } = await import('@libp2p/circuit-relay-v2');
    const { generateKeyPair } = await import('@libp2p/crypto/keys');
    const relay = await startRelay();
    try {
      const result = await runTwoPartyCheck({
        relayAddrs: [relay.addr],
        async createNode({ partyId, relayAddrs }) {
          const node = new CadreNode({
            privateKey: await generateKeyPair('Ed25519'),
            controlNetwork: { partyId, bootstrapNodes: [] },
            profile: 'transaction',
            strandFilter: { mode: 'all' },
            storage: { provider: () => new MemoryRawStorage() },
            network: {
              transports: [webSockets(), circuitRelayTransport()] as never,
              listenAddrs: [],
              relayAddrs,
              requireRelay: false,
              connectionGater: { denyDialMultiaddr: () => false },
            },
            hibernation: { enabled: false },
            requireSignedSchemas: false,
          });
          await node.start();
          return node;
        },
      }, { timeoutMs: 90_000 });
      expect(result.ok, result.log.join('\n')).toBe(true);
    } finally {
      await relay.stop();
    }
  }, 240_000);
});
