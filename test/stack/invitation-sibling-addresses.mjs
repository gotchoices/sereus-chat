/**
 * Which addresses an open strand invitation names for the party's always-on machine, set up
 * the way cadre-host sets up a node on a VPS: listening on every interface (TCP and
 * WebSocket), its public addresses passed as `CADRE_APPEND_ANNOUNCE_ADDRS`
 * (`host-process-orchestrator.ts`, `buildPublicAddresses`). A phone-shaped node (no listen
 * address, no relay) claims it with its node code, then mints an invitation.
 *
 * Passes when the invitation names one of the machine's public addresses that a phone can
 * dial (`/ws`). Fails, printing what it named instead, when it names only interface
 * addresses (loopback, private, plain TCP).
 *
 *   node invitation-sibling-addresses.mjs
 *
 * Env: PUBLIC_IP (default 198.51.100.7, documentation range, never dialed; any address
 * libp2p does not call private), PORT_TCP (4211), PORT_WS (4212), HEALTH_PORT (18211).
 * Needs `@serfab/cadre-cli` (its `cadre` binary) resolvable from here, or CLI_PATH.
 * Never prints the claim secret or the invitation token.
 */
import { CadreNode, InMemoryKeyStore, decodeNodeClaimPayload } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { levelDbNodeStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTestDb } from './classic-level-driver.mjs';

const PUBLIC_IP = process.env.PUBLIC_IP ?? '198.51.100.7';
const PORT_TCP = Number(process.env.PORT_TCP ?? 4211);
const PORT_WS = Number(process.env.PORT_WS ?? 4212);
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 18211);
const here = fileURLToPath(new URL('.', import.meta.url));
const cadreCmd = process.env.CLI_PATH
  ?? [join(here, '../../node_modules/.bin/cadre'), join(here, 'node_modules/.bin/cadre')].find(existsSync);

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const peerOf = a => a.slice(a.lastIndexOf('/p2p/') + 5);

if (!cadreCmd) { console.log('SKIP: no cadre binary (install @serfab/cadre-cli or set CLI_PATH)'); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), 'sibling-addrs-'));
let server = null;
let phone = null;
let code = 1;
try {
  // ── The always-on machine, started as cadre-host starts a child ─────────────────────
  const init = spawnSync(cadreCmd, ['init', '--dir', dir, '--port', String(PORT_TCP), '--ws-port', String(PORT_WS)], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`cadre init failed: ${init.stderr}`);
  const announced = [`/ip4/${PUBLIC_IP}/tcp/${PORT_TCP}`, `/ip4/${PUBLIC_IP}/tcp/${PORT_WS}/ws`];
  server = spawn(cadreCmd, ['start', '-c', join(dir, 'cadre.yaml'), '--health-port', String(HEALTH_PORT), '--metrics-port', String(HEALTH_PORT + 1)], {
    cwd: dir,
    env: {
      // As cadre-host does (`scrubbedParentEnv`): the node refuses a CADRE_* variable it does not know.
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CADRE_'))),
      CADRE_LISTEN_ADDRS: `/ip4/0.0.0.0/tcp/${PORT_TCP},/ip4/0.0.0.0/tcp/${PORT_WS}/ws`,
      CADRE_APPEND_ANNOUNCE_ADDRS: announced.join(','),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.setEncoding('utf8').on('data', d => { serverLog += d; });
  server.stderr.setEncoding('utf8').on('data', d => { serverLog += d; });
  let status = null;
  for (let i = 0; i < 60 && !status && server.exitCode === null; i++) {
    await sleep(1000);
    status = await fetch(`http://localhost:${HEALTH_PORT}/status`).then(r => r.json()).catch(() => null);
  }
  if (!status) throw new Error(`the machine did not answer /status:\n${serverLog.split('\n').filter(l => !l.includes('sereus-join')).slice(-15).join('\n')}`);
  log(`machine ${status.peerId.slice(-8)} announces, in order (/status multiaddrs):`);
  for (const a of status.multiaddrs) console.log(`    ${a}`);

  const codeOut = spawnSync(cadreCmd, ['code', '-c', join(dir, 'cadre.yaml'), '--health-port', String(HEALTH_PORT)], { cwd: dir, encoding: 'utf8' });
  const nodeCode = (codeOut.stdout.match(/sereus-join:\S+/) ?? [])[0];
  if (!nodeCode) throw new Error('cadre code printed no code');
  const claim = decodeNodeClaimPayload(nodeCode);
  log('its node code (what a QR code carries) names:');
  for (const a of claim.multiaddrs) console.log(`    ${a}`);

  // ── The phone: no listen address, no relay ─────────────────────────────────────────
  const tag = `sib-${randomUUID().slice(0, 8)}`;
  phone = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId: randomUUID(), bootstrapNodes: [] },
    nodeClass: 'device',
    strandFilter: { mode: 'all' },
    storage: { open: async id => levelDbNodeStorage(openTestDb(`${tag}-${id}`, 0).db) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: [],
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  });
  await phone.start();
  const genesis = await runOwnerGenesis(phone, { keyStore: new InMemoryKeyStore(), label: tag });
  if (genesis !== 'enrolled') throw new Error(`owner genesis: ${String(genesis)}`);
  await phone.claimNode(claim);
  log('phone claimed the machine');

  // ── The invitation, once the machine's record has reached the phone ────────────────
  let named = [];
  for (let i = 0; i < 90 && named.length === 0; i++) {
    await sleep(1000);
    try {
      const inv = await phone.createOpenInvitation('org.sereus.chat');
      named = inv.bootstrap.filter(a => peerOf(a) === status.peerId);
    } catch { /* no address yet */ }
  }
  if (named.length === 0) throw new Error('the invitation never named the machine (its record did not arrive in 90 s)');
  log(`the invitation names for the machine (${named.length}):`);
  for (const a of named) console.log(`    ${a}`);

  const dialable = named.filter(a => a.includes(`/ip4/${PUBLIC_IP}/`) && a.includes('/ws'));
  if (dialable.length) {
    log('PASS: the invitation names the machine\'s public WebSocket address');
    code = 0;
  } else {
    log(`FAIL: none of the machine's announced public addresses (${announced.join(', ')}) is in the invitation`);
  }
} catch (err) {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  code = 1;
} finally {
  await phone?.stop().catch(() => {});
  server?.kill('SIGINT');
  await sleep(1500);
  process.exit(code);
}
