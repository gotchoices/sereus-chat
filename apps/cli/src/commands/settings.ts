/** This profile and its node: `status`, `profile`, `prefs`, `relay`, `network`. */
import type { Prefs, Profile } from '@chat/core';
import { multiaddr } from '@multiformats/multiaddr';
import { CliFailure, EXIT, UsageError } from '../session.js';
import { resolveRelayAddress } from '../relay-address.js';
import { assignments, need, type Command } from './command.js';

const status: Command = {
  name: 'status',
  noArgs: true,
  summary: 'This profile, its node, and whether it can be reached',
  usage: '',
  async run(session) {
    const { model, host } = session;
    const reach = await model.reachability.get();
    const list = await model.strands.list();
    session.out.pairs([
      ['profile', session.dirs.name],
      ['peer', host.node.node?.peerId?.toString() ?? null],
      ['party', host.node.partyId()],
      ['owner', host.node.ownerEnrolled()],
      ['reachable', reach.reachable],
      ['relay', reach.relays.map(addr => [reach.relayStatus ?? 'none', addr])],
      ['address', host.node.listenAddrs()],
      ['strands', list.ok ? list.value.length : null],
      ['settling', await model.strands.settling()],
    ]);
  },
};

const PROFILE_FIELDS = ['name', 'email', 'phone', 'notes'] as const;

const profile: Command = {
  name: 'profile',
  summary: 'Show your profile, or change it: profile set name=Bob',
  usage: '[set <field>=<value> ...]',
  async run(session, args) {
    const current = session.unwrap(await session.model.profile.get());
    if (args[0] === 'set') {
      const next: Profile = { ...current };
      for (const [key, value] of assignments(profile, args.slice(1))) {
        if (!(PROFILE_FIELDS as readonly string[]).includes(key)) throw new UsageError(`profile: fields are ${PROFILE_FIELDS.join(', ')}`);
        next[key as (typeof PROFILE_FIELDS)[number]] = value;
      }
      session.unwrap(await session.model.profile.save(next));
      return;
    }
    if (args.length) throw new UsageError(`usage: profile ${profile.usage}`);
    session.out.pairs(PROFILE_FIELDS.map(field => [field, current[field] ?? null]));
  },
};

const PREF_KEYS = ['theme', 'language', 'notifyDefault', 'storageCeilingBytes'] as const;

const prefs: Command = {
  name: 'prefs',
  summary: 'Show preferences, or change them: prefs set notifyDefault=mentions',
  usage: `[set <key>=<value> ...]   keys: ${PREF_KEYS.join(', ')}`,
  async run(session, args) {
    if (args[0] === 'set') {
      const patch: Partial<Prefs> = {};
      for (const [key, value] of assignments(prefs, args.slice(1))) {
        if (!(PREF_KEYS as readonly string[]).includes(key)) throw new UsageError(`prefs: keys are ${PREF_KEYS.join(', ')} (relays: use "relay")`);
        (patch as Record<string, unknown>)[key] = key === 'storageCeilingBytes' ? (value === '' || value === 'none' ? null : Number(value)) : value;
      }
      session.unwrap(await session.model.prefs.set(patch));
      return;
    }
    if (args.length) throw new UsageError(`usage: prefs ${prefs.usage}`);
    const current = session.unwrap(await session.model.prefs.get());
    session.out.pairs([...PREF_KEYS.map(key => [key, current[key]] as [string, string | number | null]), ['relay', current.relayAddrs]]);
  },
};

/** How long `relay add` waits for the relay to grant a reservation before reporting. */
const RESERVATION_WAIT_MS = 30_000;

const relay: Command = {
  name: 'relay',
  summary: 'List relays, or add one (a host name is enough: relay add relay.sereus.org) or remove one',
  usage: '[add <host[:port] | multiaddr> | remove <multiaddr|row>]',
  async run(session, args) {
    const node = session.host.node;
    const saved = session.config.relays;
    const [action] = args;
    if (action === 'add' || action === 'remove') {
      const given = need(relay, args, 1, action === 'add' ? 'relay (a host name, host:port or multiaddr)' : 'relay');
      let next: string[];
      if (action === 'add') {
        const resolved = await resolveRelayAddress(given, async addr => {
          const control = node.node?.getControlNode();
          if (!control) throw new Error('the node is not running');
          const conn = await control.dial(multiaddr(addr), { signal: AbortSignal.timeout(15_000) });
          return conn.remotePeer.toString();
        }).catch(err => { throw new CliFailure(`relay: ${(err as Error).message}`, EXIT.retryable); });
        const peer = resolved.addr.slice(resolved.addr.lastIndexOf('/p2p/') + 5);
        if (resolved.source !== 'as given') session.out.note(`relay ${given}: ${resolved.addr}\n  its peer id ${peer} was ${resolved.source}`);
        // The same relay under another name (sereus.org and relay.sereus.org are one machine):
        // one entry per relay, identified by its peer id.
        const already = saved.find(a => a.endsWith(`/p2p/${peer}`));
        if (already) {
          session.out.note(`relay: already using that relay (${peer}) as ${already}`);
          next = saved;
        } else {
          next = [...saved, resolved.addr];
        }
      } else {
        const target = /^\d+$/.test(given) ? saved[Number(given) - 1] : given;
        if (!target || !saved.includes(target)) throw new UsageError(`relay: no saved relay ${JSON.stringify(given)}`);
        next = saved.filter(a => a !== target);
      }
      if (next !== saved) {
        session.out.note('restarting the node with the new relays…');
        // Wait for the restart (the model's prefs.set does not), then for a reservation.
        await node.applyRelays(next);
      }
      if (next.length) {
        const deadline = Date.now() + RESERVATION_WAIT_MS;
        while (Date.now() < deadline && node.relayStatus() !== 'reserved') await new Promise(r => setTimeout(r, 500));
        if (node.relayStatus() !== 'reserved') session.out.note(`no reservation yet (${node.relayStatus() ?? 'no status'}); it keeps trying — see "relay"`);
      }
    } else if (action) {
      throw new UsageError(`usage: relay ${relay.usage}`);
    }
    const reach = await session.model.reachability.get();
    session.out.rows(['row', 'status', 'multiaddr'], reach.relays.map((addr, i) => ({
      row: i + 1, status: reach.relayStatus ?? 'none', multiaddr: addr,
    })));
  },
};

const network: Command = {
  name: 'network',
  noArgs: true,
  summary: 'The machines acting for this profile (its cadre)',
  usage: '',
  async run(session) {
    const cadre = session.unwrap(await session.model.cadre.status());
    session.out.pairs([
      ['running', cadre.running],
      ['party', cadre.partyId],
      ['peer', cadre.peerId],
      ['owner', cadre.ownerEnrolled],
      ['ownerFingerprint', cadre.ownerFingerprint],
      ['machine', cadre.machines.map(m => [m.peerId, m.thisDevice ? 'this' : ''])],
    ]);
  },
};

const idle: Command = {
  name: 'idle',
  noArgs: true,
  summary: 'Keep the node running until Ctrl-C (reachable, syncing; for --bridge test tools)',
  usage: '',
  async run(session) {
    session.out.note('idle; Ctrl-C to stop');
    const signal = session.signal;
    await new Promise<void>(resolve => {
      if (signal.aborted) resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  },
};

export const settingsCommands = [status, profile, prefs, relay, network, idle];
