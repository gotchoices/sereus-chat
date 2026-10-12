/**
 * The stack boundary (docs/app-family.md, "Where an app touches the stack"): app code
 * imports the Sereus stack only where it builds its host — the polyfill entry, polyfills/
 * and src/cadre/ (src/host/ from Phase 5). Everything else goes through @chat/core.
 * Until the migration's Phase 6 the data layer and screens still break this rule; the
 * count is tracked in docs/STATUS.md and goes to zero.
 */
const STACK = [
  '@serfab/*',
  '@optimystic/*',
  '@quereus/*',
  'libp2p',
  '@libp2p/*',
  'p2p-fret',
  '@chainsafe/*',
  '@multiformats/*',
  'rn-leveldb',
];

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['src/**/*.{ts,tsx,js}', 'App.tsx'],
      excludedFiles: ['src/cadre/**'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: STACK,
            message: 'Stack imports belong in the host (src/cadre/, later src/host/) or the polyfill entry; elsewhere use @chat/core.',
          }],
        }],
      },
    },
  ],
};
