const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// chat project root (two levels up from apps/mobile/)
const projectRoot = path.resolve(__dirname, '../..');
// Workspace root that contains the cloned sereus / optimystic / quereus / fret repos
const workspaceRoot = path.resolve(__dirname, '../../..');

// Stack mode is derived from package.json — the same file `use-stack.sh` edits.
// In `local` mode the ser packages are portal:'d to local clones and we alias
// them to source below; in `npm` mode they come from node_modules like any
// other dependency and these aliases / watch folders must NOT be applied.
const appPkg = require('./package.json');
const localStack = String(
  (appPkg.dependencies && appPkg.dependencies['@serfab/cadre-core']) || '',
).startsWith('portal:');

// Node.js built-in stubs for libp2p / cadre-core transitive imports.
// Metro statically traces every require() in the dependency graph, even calls
// inside runtime-guarded `if (process.versions?.node)` branches that never
// execute on RN.  The stubs satisfy the bundler; the guards prevent the code
// from actually being reached.
//
// Shared by both stack modes:
//   os       — @libp2p/utils  get-thin-waist-addresses.js.  Mapped to a REAL
//              shim (networkInterfaces/platform/type/hostname), not `{}` —
//              the node variant of that module lands in the bundle and would
//              throw on `{}.networkInterfaces()` if a listener is ever created.
//   net, tls — @libp2p/websockets  listener.js
//
// npm mode (cadre-core 0.8.x) additionally needs:
//   crypto   — @serfab/cadre-core  push-notifier-fcm.js (node:crypto.sign, FCM push).
//              Mapped to a real shim (createHash via @noble); sign() throws if the
//              unused FCM push path is ever invoked.
//   http2    — @serfab/cadre-core  push-notifier-apns.js (APNS push, Node-only,
//              unused on device).
//
// local mode (cadre-core 0.7.x) instead needs:
//   path            — @serfab/cadre-core  getStrandStoragePath (Node-only helper)
//   fs, fs/promises — @serfab/cadre-core  ControlDatabase.loadSchema
// 0.8.x moved both behind the `key-store-file` subpath, which RN never imports,
// so they must NOT be stubbed in npm mode — stubbing `path` to {} there would
// silently break any legitimate consumer.
const emptyShim = path.resolve(__dirname, 'shims/empty.js');
const nodeCryptoShim = path.resolve(__dirname, 'shims/node-crypto.js');
const nodeOsShim = path.resolve(__dirname, 'shims/node-os.js');

const sharedNodeStubs = {
  os: nodeOsShim,
  'node:os': nodeOsShim,
  net: emptyShim,
  'node:net': emptyShim,
  tls: emptyShim,
  'node:tls': emptyShim,
};

const localOnlyNodeStubs = {
  path: emptyShim,
  'node:path': emptyShim,
  fs: emptyShim,
  'node:fs': emptyShim,
  'fs/promises': emptyShim,
  'node:fs/promises': emptyShim,
};

const npmOnlyNodeStubs = {
  crypto: nodeCryptoShim,
  'node:crypto': nodeCryptoShim,
  http2: emptyShim,
  'node:http2': emptyShim,
};

const nodeBuiltinStubs = {
  ...sharedNodeStubs,
  ...(localStack ? localOnlyNodeStubs : npmOnlyNodeStubs),
};

// Canonical names → source paths in the sibling repos.  Local-stack only;
// in npm mode these resolve from node_modules like any other dependency.
const serSourceAliases = {
  '@serfab/cadre-core': path.resolve(workspaceRoot, 'sereus/packages/cadre-core'),
  '@serfab/strand-proto': path.resolve(workspaceRoot, 'sereus/packages/strand-proto'),
  '@optimystic/db-core': path.resolve(workspaceRoot, 'optimystic/packages/db-core'),
  '@optimystic/db-p2p': path.resolve(workspaceRoot, 'optimystic/packages/db-p2p'),
  '@optimystic/db-p2p-storage-rn': path.resolve(workspaceRoot, 'optimystic/packages/db-p2p-storage-rn'),
  '@optimystic/quereus-plugin-crypto': path.resolve(workspaceRoot, 'optimystic/packages/quereus-plugin-crypto'),
  '@optimystic/quereus-plugin-optimystic': path.resolve(workspaceRoot, 'optimystic/packages/quereus-plugin-optimystic'),
  '@quereus/quereus': path.resolve(workspaceRoot, 'quereus/packages/quereus'),
  'p2p-fret': path.resolve(workspaceRoot, 'fret/packages/fret'),
};

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    // chat project root — covers `mock/` (shared mock data) and `design/`
    // (src/data/chat-sapp.ts imports design/specs/domain/chat-sapp.qsql).
    // Required in BOTH stack modes.
    projectRoot,
    // Local-stack only: the ser/ workspace root, so Metro can resolve files
    // anywhere under sereus/optimystic/quereus/fret, including the nested
    // node_modules used by the resolveRequest redirect below (v12 multiaddr).
    ...(localStack ? [workspaceRoot] : []),
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
      // Local-stack only: workspace node_modules for portal'd packages.
      ...(localStack
        ? [
            path.resolve(workspaceRoot, 'sereus/node_modules'),
            path.resolve(workspaceRoot, 'optimystic/node_modules'),
            path.resolve(workspaceRoot, 'quereus/node_modules'),
            path.resolve(workspaceRoot, 'fret/node_modules'),
          ]
        : []),
    ],
    extraNodeModules: {
      ...(localStack ? serSourceAliases : {}),
      ...nodeBuiltinStubs,
    },
    resolveRequest: (context, moduleName, platform) => {
      // Local-stack only: @multiformats/multiaddr v13 dropped the `/convert`
      // subpath that @chainsafe/libp2p-gossipsub still imports.  A portal
      // install forces every consumer to v13 (because @serfab/strand-proto and
      // @optimystic/db-p2p declare incompatible ranges and yarn berry's portal
      // protocol refuses to link them otherwise).  Redirect the specific
      // subpath to the v12.5.1 copy in the sereus workspace, where /convert is
      // still exported.
      //
      // In npm mode there is no multiaddr resolution pin, so yarn nests v12
      // under gossipsub and v13 under db-p2p and ordinary resolution works.
      // Drop the local-mode branch once the sereus stack aligns strand-proto
      // and db-p2p on the same multiaddr major.
      if (localStack && moduleName === '@multiformats/multiaddr/convert') {
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
