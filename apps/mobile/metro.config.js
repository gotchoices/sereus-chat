const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// chat project root (two levels up from apps/mobile/)
const projectRoot = path.resolve(__dirname, '../..');
// Workspace root that contains the cloned sereus / optimystic / quereus / fret repos
const workspaceRoot = path.resolve(__dirname, '../../..');

// Node.js built-in stubs for libp2p / cadre-core transitive imports.
// Metro statically traces every require() in the dependency graph, even calls
// inside runtime-guarded `if (process.versions?.node)` branches that never
// execute on RN.  The stubs satisfy the bundler; the guards prevent the code
// from actually being reached.
//   os       — @libp2p/utils  get-thin-waist-addresses.js
//   net, tls — @libp2p/websockets  listener.js
//   path     — @serfab/cadre-core  getStrandStoragePath (Node-only helper)
//   fs/fs/promises — @serfab/cadre-core  ControlDatabase.loadSchema
const emptyShim = path.resolve(__dirname, 'shims/empty.js');
const nodeBuiltinStubs = {
  os: emptyShim,
  'node:os': emptyShim,
  net: emptyShim,
  'node:net': emptyShim,
  tls: emptyShim,
  'node:tls': emptyShim,
  path: emptyShim,
  'node:path': emptyShim,
  fs: emptyShim,
  'node:fs': emptyShim,
  'fs/promises': emptyShim,
  'node:fs/promises': emptyShim,
};

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    // chat/mock — shared mock data at project root
    path.resolve(projectRoot, 'mock'),
    // ser/ workspace root — needed so Metro can resolve files anywhere under
    // sereus/optimystic/quereus/fret, including nested node_modules used by
    // resolveRequest redirects below (e.g. v12 @multiformats/multiaddr).
    workspaceRoot,
  ],
  transformer: {
    // Lets us `import schema from './schema.qsql'` and get the raw SQL string.
    babelTransformerPath: require.resolve('./metro.transformer.js'),
  },
  resolver: {
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['import', 'require', 'default'],
    unstable_conditionsByPlatform: {
      ios: ['react-native', 'import', 'require', 'default'],
      android: ['react-native', 'import', 'require', 'default'],
    },
    assetExts: defaultConfig.resolver.assetExts.filter(ext => ext !== 'qsql'),
    sourceExts: [...defaultConfig.resolver.sourceExts, 'qsql'],
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
      // Workspace node_modules for portal'd packages
      path.resolve(workspaceRoot, 'sereus/node_modules'),
      path.resolve(workspaceRoot, 'optimystic/node_modules'),
      path.resolve(workspaceRoot, 'quereus/node_modules'),
      path.resolve(workspaceRoot, 'fret/node_modules'),
    ],
    // Canonical names → source paths in the sibling repos.
    extraNodeModules: {
      '@serfab/cadre-core': path.resolve(workspaceRoot, 'sereus/packages/cadre-core'),
      '@serfab/strand-proto': path.resolve(workspaceRoot, 'sereus/packages/strand-proto'),
      '@optimystic/db-core': path.resolve(workspaceRoot, 'optimystic/packages/db-core'),
      '@optimystic/db-p2p': path.resolve(workspaceRoot, 'optimystic/packages/db-p2p'),
      '@optimystic/db-p2p-storage-rn': path.resolve(workspaceRoot, 'optimystic/packages/db-p2p-storage-rn'),
      '@optimystic/quereus-plugin-crypto': path.resolve(workspaceRoot, 'optimystic/packages/quereus-plugin-crypto'),
      '@optimystic/quereus-plugin-optimystic': path.resolve(workspaceRoot, 'optimystic/packages/quereus-plugin-optimystic'),
      '@quereus/quereus': path.resolve(workspaceRoot, 'quereus/packages/quereus'),
      'p2p-fret': path.resolve(workspaceRoot, 'fret/packages/fret'),
      ...nodeBuiltinStubs,
    },
    resolveRequest: (context, moduleName, platform) => {
      // @multiformats/multiaddr v13 dropped the `/convert` subpath that
      // @chainsafe/libp2p-gossipsub still imports.  Chat's portal install
      // forces every consumer to v13 (because @serfab/strand-proto and
      // @optimystic/db-p2p declare incompatible ranges and yarn berry's
      // portal protocol refuses to link them otherwise).  Redirect the
      // specific subpath to the v12.5.1 copy in the sereus workspace, where
      // /convert is still exported.  Drop this once the sereus stack aligns
      // strand-proto and db-p2p on the same multiaddr major.
      if (moduleName === '@multiformats/multiaddr/convert') {
        return {
          type: 'sourceFile',
          filePath: path.resolve(
            workspaceRoot,
            'sereus/node_modules/@multiformats/multiaddr/dist/src/convert.js',
          ),
        };
      }

      // Force @babel/runtime helpers to CJS.
      //
      // @babel/runtime's exports field lists conditions: node → import → default.
      // With 'import' active (needed for ESM-only packages like @libp2p/crypto),
      // Metro picks the ESM wrapper and require() receives the module *object*
      // instead of the helper *function*, causing:
      //   "TypeError: _interopRequireDefault is not a function (it is Object)"
      // require.resolve() uses the 'node' condition (first in the exports map),
      // so it always returns the CJS path.
      if (moduleName.startsWith('@babel/runtime/')) {
        try {
          return { type: 'sourceFile', filePath: require.resolve(moduleName) };
        } catch {
          // Fall through to default resolution
        }
      }
      return context.resolveRequest(
        { ...context, resolveRequest: undefined },
        moduleName,
        platform,
      );
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
