/**
 * IPFS's own block store compliance suite (interface-blockstore-tests) against the adapter over
 * a host byte store, so the phone and Node stores behave as any IPFS block store does.
 */
import { describe } from 'vitest'
import { interfaceBlockstoreTests as suite } from 'interface-blockstore-tests'
import { KvBlockstore, MemoryByteStore } from './kv-blockstore.js'

describe('KvBlockstore', () => {
  suite({ setup: () => new KvBlockstore(new MemoryByteStore()), teardown: () => {} })
})
