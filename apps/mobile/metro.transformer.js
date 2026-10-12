let upstreamTransformer;
try {
  upstreamTransformer = require('@react-native/metro-babel-transformer');
} catch (_err) {
  upstreamTransformer = require('metro-babel-transformer');
}

/**
 * Metro transformer: the upstream Babel transformer, told which babel.config.js to use.
 * (It also imported `.qsql` files as strings until the schema became a generated module
 * in @chat/core.)
 */
// THE APP'S babel.config.js MUST BE THE ONE BABEL SEES. Metro's projectRoot is the
// repo root (metro.config.js: `path.resolve(__dirname, '../..')`, so watchFolders
// and resolution span the repo), and the RN transformer hands that to Babel as
// `cwd` — where Babel looks for its project-wide babel.config.js. There is none
// at the repo root, so this app's config (the static-block plugin, and the
// react-native-worklets plugin keyboard-controller needs) was silently never
// applied: worklets stayed untransformed and the app died at start with
// "[Worklets] Failed to create a worklet". Give Babel this app's directory.
const APP_ROOT = __dirname;

module.exports.transform = function transform({ src, filename, options }) {
  return upstreamTransformer.transform({ src, filename, options: { ...options, projectRoot: APP_ROOT } });
};
