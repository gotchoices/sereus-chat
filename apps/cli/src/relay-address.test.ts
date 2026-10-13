import { describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  resolveTxt: async (name: string) => {
    if (name === '_dnsaddr.relay.example') {
      return [['dnsaddr=/dns4/relay.example/tcp/4001/p2p/12D3KooWRelay'], ['dnsaddr=/dns4/relay.example/tcp/4011/ws/p2p/12D3KooWRelay']];
    }
    throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  },
}));

const { resolveRelayAddress } = await import('./relay-address.js');
const learn = async () => '12D3KooWLearned';

describe('relay addresses', () => {
  it('uses a full address as given', async () => {
    expect(await resolveRelayAddress('/dns4/a/tcp/1/ws/p2p/12D3KooWX', learn)).toEqual({ addr: '/dns4/a/tcp/1/ws/p2p/12D3KooWX', source: 'as given' });
  });
  it('takes a host\'s published WebSocket address', async () => {
    expect(await resolveRelayAddress('relay.example', learn)).toEqual({ addr: '/dns4/relay.example/tcp/4011/ws/p2p/12D3KooWRelay', source: 'published by DNS' });
    expect((await resolveRelayAddress('/dnsaddr/relay.example', learn)).source).toBe('published by DNS');
  });
  it('fills in WebSocket and the default port, and learns the peer id', async () => {
    expect(await resolveRelayAddress('other.example', learn)).toEqual({ addr: '/dns4/other.example/tcp/4011/ws/p2p/12D3KooWLearned', source: 'learned by connecting' });
    expect((await resolveRelayAddress('relay.example:4012', learn)).addr).toBe('/dns4/relay.example/tcp/4012/ws/p2p/12D3KooWLearned');
    expect((await resolveRelayAddress('10.0.0.5', learn)).addr).toBe('/ip4/10.0.0.5/tcp/4011/ws/p2p/12D3KooWLearned');
    expect((await resolveRelayAddress('/dns4/x/tcp/4002/ws', learn)).addr).toBe('/dns4/x/tcp/4002/ws/p2p/12D3KooWLearned');
  });
  it('says when nothing answers', async () => {
    await expect(resolveRelayAddress('other.example', async () => { throw new Error('timeout'); })).rejects.toThrow(/nothing answered at \/dns4\/other.example\/tcp\/4011\/ws/);
  });
  it('suggests relay.<host> when that publishes a relay, without using it', async () => {
    await expect(resolveRelayAddress('example', async () => { throw new Error('timeout'); })).rejects.toThrow(/Did you mean relay.example\?/);
  });
});
