/**
 * The mock's fixtures for this app: the repo root's mock/data, bundled by Metro, which
 * includes JSON only through static `require`s — hence a list, not a loop.
 */
import type { FixtureSource } from '@chat/core';

const FIXTURES: Record<string, unknown> = {
  'Strands/happy': require('../../mock/data/Strands/happy.json'),
  'Strands/empty': require('../../mock/data/Strands/empty.json'),
  'Strands/error': require('../../mock/data/Strands/error.json'),
  'Messages/happy': require('../../mock/data/Messages/happy.json'),
  'Messages/empty': require('../../mock/data/Messages/empty.json'),
  'Members/happy': require('../../mock/data/Members/happy.json'),
  'Members/empty': require('../../mock/data/Members/empty.json'),
  'StrandMedia/happy': require('../../mock/data/StrandMedia/happy.json'),
  'StrandMedia/empty': require('../../mock/data/StrandMedia/empty.json'),
  'StrandState/happy': require('../../mock/data/StrandState/happy.json'),
  'StrandState/empty': require('../../mock/data/StrandState/empty.json'),
  'Search/happy': require('../../mock/data/Search/happy.json'),
  'Search/empty': require('../../mock/data/Search/empty.json'),
  'Invitations/happy': require('../../mock/data/Invitations/happy.json'),
  'Invitations/empty': require('../../mock/data/Invitations/empty.json'),
  'Prefs/happy': require('../../mock/data/Prefs/happy.json'),
  'StorageUsage/happy': require('../../mock/data/StorageUsage/happy.json'),
  'Profile/happy': require('../../mock/data/Profile/happy.json'),
};

export const appFixtures: FixtureSource = (name, variant) => FIXTURES[`${name}/${variant}`];
