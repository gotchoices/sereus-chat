const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// chat project root (two levels up from apps/mobile/)
const projectRoot = path.resolve(__dirname, '../..');
// Workspace root that contains the cloned sereus / optimystic / quereus / fret repos
const workspaceRoot = path.resolve(__dirname, '../../..');

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Linked packages (packages/*) resolve the APP's copy of the stack ─────────────
//
// `@chat/core` is linked (`link:../../packages/core`), so Metro sees its files at their
// real path, packages/core/dist/…, and an import from there would walk up to
// packages/core/node_modules or the repo root's node_modules — both of which hold a
// copy of the stack for the core's own tests — before this app's. `nodeModulesPaths`
// is searched only after that walk, so it cannot prevent it. Instead, an import made
// FROM a linked package of one of the core's peer dependencies is resolved as if this
// app had made it. Only the peers: everything they import then resolves from the app's
// copy by the normal walk, and transitive packages that legitimately differ between
// stack packages (@noble/*, @multiformats/*) are left alone.
// (docs/app-family.md, "Linked code must resolve the app's copy of the stack".)
const packagesDir = path.join(projectRoot, 'packages') + path.sep;
const corePeers = Object.keys(
  require(path.join(projectRoot, 'packages/core/package.json')).peerDependencies ?? {},
);
const isCorePeer = name => corePeers.some(p => name === p || name.startsWith(p + '/'));
const appOrigin = path.join(__dirname, 'index.js');

// ── Build check: one copy of the stack's identity-bearing packages ───────────────
//
// Two copies of either in one bundle breaks `instanceof` checks and transport
// registration, silently. Every resolution into one of them records the package's
// root; a second root fails the bundle with both paths named.
const SINGLE_COPY = ['@serfab/cadre-core', '@libp2p/interface'];
const singleCopyRoots = new Map();
function checkSingleCopy(resolution) {
  const file = resolution && resolution.filePath;
  if (!file) return resolution;
  for (const name of SINGLE_COPY) {
    const marker = `${path.sep}node_modules${path.sep}${name}${path.sep}`;
    const at = file.lastIndexOf(marker);
    if (at < 0) continue;
    const root = file.slice(0, at + marker.length);
    const seen = singleCopyRoots.get(name);
    if (seen && seen !== root) {
      throw new Error(`Two copies of ${name} in the bundle:\n  ${seen}\n  ${root}\n` +
        'See docs/app-family.md, "Linked code must resolve the app\'s copy of the stack".');
    }
    singleCopyRoots.set(name, root);
  }
  return resolution;
}

// Stack mode is derived from package.json — the same file `scripts/use-stack.sh` (repo root) edits.
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
  // Real implementations, not stubs: unlike net/tls, these have working
  // userland ports and upstream code genuinely uses them.  Carried to match
  // sereus/packages/reference-app-rn/metro.config.js — nothing in the graph
  // reaches for them today, but each stack upgrade pulls in more upstream
  // code, and an unmapped `node:*` specifier fails the whole bundle with a
  // resolution error that names the importer rather than the cause.
  stream: require.resolve('readable-stream'),
  'node:stream': require.resolve('readable-stream'),
  // TRAILING SLASH, and it is not cosmetic. `buffer` is ALSO a Node builtin, so
  // bare `require.resolve('buffer')` returns the string "buffer" — the builtin's
  // name, not a path — and this map then points Metro at nothing. That stayed
  // invisible for as long as nothing in the graph imported `buffer`; the moment
  // something did (react-native-svg's `fetchData.ts`, pulled in when a dependency
  // change re-hoisted it to its `src`), the whole bundle failed with "Unable to
  // resolve module buffer", naming the importer rather than this line. The slash
  // forces package resolution. `readable-stream` is not a builtin, so it needs no
  // such guard.
  buffer: require.resolve('buffer/'),
  'node:buffer': require.resolve('buffer/'),
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
    // Points Babel at this app's babel.config.js (see metro.transformer.js).
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
    // The chat root is a watch folder (for `design/` and `mock/`), and it is also the
    // Yarn workspace root for packages/* and test/stack — so it has a node_modules of
    // its own holding a second copy of the stack. Nothing in the app may come from
    // there or from test/: every dependency resolves from this app's node_modules.
    // (docs/app-family.md, "Linked code must resolve the app's copy of the stack".)
    blockList: [
      defaultConfig.resolver.blockList,
      new RegExp(`^${escapeRegExp(path.join(projectRoot, 'node_modules'))}/`),
      new RegExp(`^${escapeRegExp(path.join(projectRoot, 'test'))}/`),
    ].flat().filter(Boolean),
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
    resolveRequest: (context, moduleName, platform) =>
      checkSingleCopy(resolveChat(context, moduleName, platform)),
  },
};

function resolveChat(context, moduleName, platform) {
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
  if (context.originModulePath.startsWith(packagesDir) && isCorePeer(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: appOrigin, resolveRequest: undefined },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(
    { ...context, resolveRequest: undefined },
    moduleName,
    platform,
  );
}

module.exports = mergeConfig(defaultConfig, config);
