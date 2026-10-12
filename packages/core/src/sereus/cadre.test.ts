/**
 * Claiming a node (sereus 1.14): a cadre-core node waiting to be claimed, and party A's
 * Sereus model claiming it from its node code — the path a phone takes with a code
 * scanned from a home server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { CadreNode, encodeNodeClaimPayload, type NodeClaimRecord } from '@serfab/cadre-core';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { createTestParty, type TestParty } from '../testing/node-host.js';
import { isPublicAddress, nodeReach, readNodeCode } from './node-code.js';

describe('node codes', () => {
  const secret = randomBytes(32).toString('base64url');
  const peerId = '12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo';
  const code = encodeNodeClaimPayload({ peerId, multiaddrs: [`/dns4/home.example/tcp/4002/ws/p2p/${peerId}`], secret });

  it('reads a code, and refuses what is not one', () => {
    const reading = readNodeCode(code);
    expect(reading.ok && reading.payload.peerId).toBe(peerId);
    expect(readNodeCode(`https://example.com/add#${encodeURIComponent(code)}`).ok).toBe(true);
    expect(readNodeCode('https://sereus.org/chat/invite/#tok')).toMatchObject({ ok: false, problem: 'not-node-code' });
    expect(readNodeCode('sereus-join:2.abc')).toMatchObject({ ok: false, problem: 'newer-version' });
    expect(readNodeCode('sereus-join:1.abc')).toMatchObject({ ok: false, problem: 'damaged' });
  });

  it('judges reach by the first host in each address', () => {
    expect(nodeReach(['/ip4/192.168.1.20/tcp/4002/ws'])).toBe('home-network');
    expect(nodeReach(['/ip4/192.168.1.20/tcp/4002/ws', '/dns4/x.example/tcp/443/wss'])).toBe('anywhere');
    expect(isPublicAddress('/ip4/100.70.1.2/tcp/1')).toBe(false); // Tailscale
    expect(isPublicAddress('/ip4/8.8.8.8/tcp/1')).toBe(true);
    expect(isPublicAddress('/ip6/fe80::1/tcp/1')).toBe(false);
  });
});

describe('claiming a node', () => {
  let owner: TestParty;
  let node: CadreNode;
  let recorded: NodeClaimRecord | null = null;
  const secret = randomBytes(32).toString('base64url');

  beforeAll(async () => {
    const scopes = new Map<string, MemoryRawStorage>();
    node = new CadreNode({
      privateKey: await generateKeyPair('Ed25519'),
      controlNetwork: { partyId: 'unclaimed', bootstrapNodes: [] },
      profile: 'transaction',
      claim: { secret, record: async claim => { recorded = claim; } },
      storage: {
        provider: (scope: string) => {
          let s = scopes.get(scope);
          if (!s) scopes.set(scope, (s = new MemoryRawStorage()));
          return s;
        },
      },
      network: {
        transports: [webSockets(), circuitRelayTransport()] as never,
        listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'],
        connectionGater: { denyDialMultiaddr: () => false },
      },
      requireSignedSchemas: false,
    });
    await node.start();
    owner = await createTestParty('owner', { listen: true });
    await owner.boot();
  });
  afterAll(async () => {
    await Promise.allSettled([owner?.stop(), node?.stop()]);
  });

  it('claims it from its code, and lists it among the machines', async () => {
    expect(node.isAwaitingClaim()).toBe(true);
    const peerId = node.peerId!.toString();
    const code = encodeNodeClaimPayload({
      peerId,
      multiaddrs: node.getMultiaddrs().map(m => m.toString()).filter(a => a.includes('/ws')),
      secret,
    });

    const preview = await owner.model.cadre.inspectNodeCode(code);
    expect(preview).toMatchObject({ ok: true, value: { peerId, reach: 'home-network' } });

    const claimed = await owner.model.cadre.claimNode(code);
    expect(claimed.ok ? null : claimed.error).toBeNull();
    expect(recorded?.partyId).toBe(owner.host.node.partyId());

    const status = await owner.model.cadre.status();
    expect(status.ok && status.value.machines.map(m => m.peerId)).toContain(peerId);
    expect(status.ok && status.value.ownerEnrolled).toBe(true);
  });

  it('refuses a damaged code before dialing anything', async () => {
    const result = await owner.model.cadre.claimNode('sereus-join:1.abc');
    expect(result.ok ? null : { kind: result.error.kind, reason: result.error.reason })
      .toEqual({ kind: 'invalid-node-code', reason: 'damaged' });
  });
});
