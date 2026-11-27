/**
 * Attachments between two transient members, through a relay as phones meet (`strand-files.ts`):
 *   1. Bob is away when Alice sends; then Alice goes away too; both come back at once.
 *   2. Alice's party has a second machine, a cadre member (a server-class cadre-core node, no
 *      chat app). Alice sends while Bob is away, then goes away herself: Bob gets the message
 *      from the cadre member's replica, and the photo from whoever holds it (the cadre member
 *      may pull it as a cohort member). Until then, "still arriving": no error, no hang.
 * "Away" is a strand put to sleep (`hibernateStrand`), as a phone in the background does.
 *
 * Both failed until sereus 1.25 (gotchoices/sereus#67, gap 2): Alice's strand slept before anyone
 * had fetched her photo, and its node came back without the pieces it held in memory. Since 1.25
 * the pieces are in the storage the host hands the node (`storage.open`), so they outlive a sleep.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createTestParty, startRelay, until, type TestParty } from '../testing/node-host.js';
import { claimCadreMember, type CadreMember } from '../testing/cadre-member.js';
import type { Attachment } from '../model/index.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const note = (line: string) => process.stderr.write(`[file transient] ${line}\n`);
const dir = mkdtempSync(join(tmpdir(), 'chat-transient-'));
function photo(name: string, size: number): { path: string; hash: string } {
  const bytes = new Uint8Array(randomBytes(size));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return { path, hash: sha(bytes) };
}

async function pair(relayAddr: string, before?: (alice: TestParty) => Promise<void>) {
  const alice = await createTestParty('alice', { relayAddr });
  const bob = await createTestParty('bob', { relayAddr });
  await alice.boot(); await bob.boot();
  await until(() => alice.node.getMultiaddrs().length > 0 && bob.node.getMultiaddrs().length > 0, 'both reachable');
  await before?.(alice);
  const inv = value(await alice.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
  const { strandId } = value(await bob.model.invitations.accept(inv.token));
  await until(async () => {
    const s = await alice.model.strands.list();
    return s.ok && s.value.some(x => x.id === strandId && !x.opening);
  }, 'the strand open at Alice', 120_000);
  return { alice, bob, strandId };
}

/** Send, retrying while the strand settles (a write right after a wake can be refused). */
async function send(p: TestParty, strandId: string, content: string, path: string): Promise<void> {
  await until(async () => {
    const r = await p.model.messages.send(strandId, { content, attachments: [{ id: 'x', type: 'image', uri: path, name: 'p.jpg', locality: 'local' }] });
    if (!r.ok) note(`send "${content}" refused for now: ${r.error.kind} ${r.error.message}`);
    return r.ok;
  }, `send "${content}"`, 120_000);
}

async function attachmentAt(p: TestParty, strandId: string, content: string): Promise<Attachment | undefined> {
  const msgs = await p.model.messages.list(strandId);
  return msgs.ok ? msgs.value.find(m => m.content === content)?.attachments[0] : undefined;
}

describe('two transient members through a relay', () => {
  let relay: Awaited<ReturnType<typeof startRelay>>;
  let alice: TestParty, bob: TestParty, strandId: string;
  beforeAll(async () => {
    relay = await startRelay();
    ({ alice, bob, strandId } = await pair(relay.addr));
  }, 240_000);
  afterAll(async () => { await Promise.allSettled([alice?.stop(), bob?.stop()]); await relay?.stop(); });

  it('Bob away when Alice sends, then both away, then both back at once: the photo crosses', async () => {
    const p = photo('both-away.jpg', 900_000);
    await bob.node.hibernateStrand(strandId);
    await send(alice, strandId, 'sent while you were away', p.path);
    await alice.node.hibernateStrand(strandId);
    await new Promise<void>(r => setTimeout(() => r(), 3000));
    const t0 = Date.now();
    await Promise.all([alice.node.wakeStrand(strandId), bob.node.wakeStrand(strandId)]);
    note(`both woke in ${Date.now() - t0} ms`);
    let att: Attachment | undefined;
    await until(async () => {
      att = await attachmentAt(bob, strandId, 'sent while you were away');
      return att?.locality === 'local';
    }, 'the photo at Bob', 180_000);
    note(`the photo was at Bob ${Date.now() - t0} ms after both woke`);
    expect(sha(new Uint8Array(readFileSync(att!.uri!)))).toBe(p.hash);
  }, 300_000);
});

describe("Alice's party has a cadre member", () => {
  let relay: Awaited<ReturnType<typeof startRelay>>;
  let alice: TestParty, bob: TestParty, strandId: string;
  let member: CadreMember;

  beforeAll(async () => {
    relay = await startRelay();
    ({ alice, bob, strandId } = await pair(relay.addr, async (a) => {
      member = await claimCadreMember(relay.addr, a, note);
    }));
    let lastSeen = '';
    await until(() => {
      const seen = `party ${member.node.partyId === alice.node.partyId ? 'Alice' : member.node.partyId}, awaiting claim ${member.node.isAwaitingClaim()}, discovered ${[...member.node.getDiscoveredStrands().keys()].map(k => k.slice(0, 8)).join(',') || '-'}, running ${[...member.node.getStrands().keys()].map(k => k.slice(0, 8)).join(',') || '-'}, control peers ${member.node.getControlNode()?.getConnections().length ?? 0}`;
      if (seen !== lastSeen) { lastSeen = seen; note(`cadre member: ${seen}`); }
      return member.node.getStrands().has(strandId);
    }, "the strand on Alice's cadre member", 180_000);
    note("the cadre member hosts the strand");
  }, 420_000);
  afterAll(async () => {
    await Promise.allSettled([alice?.stop(), bob?.stop(), member?.stop()]);
    await relay?.stop();
  });

  it("Bob gets the message from the cadre member while Alice is away, and the photo once she is back", async () => {
    const p = photo('member.jpg', 800_000);
    await bob.node.hibernateStrand(strandId);
    await send(alice, strandId, 'the cadre member keeps this', p.path);
    // Let the write reach the cadre member, then Alice goes away.
    await new Promise<void>(r => setTimeout(() => r(), 5000));
    await alice.node.hibernateStrand(strandId);
    const t0 = Date.now();
    await bob.node.wakeStrand(strandId);

    let att: Attachment | undefined;
    await until(async () => { att = await attachmentAt(bob, strandId, 'the cadre member keeps this'); return !!att; },
      "the message at Bob, Alice away", 180_000);
    note(`Bob had the message ${Date.now() - t0} ms after waking, with Alice away`);
    const early = await bob.model.media.fetch(strandId, att!.id);
    expect(early.ok ? 'fetched' : `${early.error.kind}/${early.error.reason}`).toBe('unavailable/still-arriving');

    const t1 = Date.now();
    await alice.node.wakeStrand(strandId);
    await until(async () => {
      att = await attachmentAt(bob, strandId, 'the cadre member keeps this');
      return att?.locality === 'local';
    }, 'the photo at Bob once Alice is back', 180_000);
    note(`the photo was at Bob ${Date.now() - t1} ms after Alice came back`);
    expect(sha(new Uint8Array(readFileSync(att!.uri!)))).toBe(p.hash);
  }, 480_000);
});
