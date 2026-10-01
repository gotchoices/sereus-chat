const fs = require('fs');
let upstreamTransformer;
try {
  upstreamTransformer = require('@react-native/metro-babel-transformer');
} catch (_err) {
  upstreamTransformer = require('metro-babel-transformer');
}

/**
 * Metro transformer that imports `.qsql` files as raw strings at bundle time,
 * so app code can do:
 *
 *   import schemaSQL from '../../../../design/specs/domain/schema.qsql';
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
  const babelOptions = { ...options, projectRoot: APP_ROOT };
  if (filename.endsWith('.qsql')) {
    const contents = fs.readFileSync(filename, 'utf8');
    const code = `module.exports = ${JSON.stringify(contents)};`;
    return upstreamTransformer.transform({ src: code, filename, options: babelOptions });
  }
  return upstreamTransformer.transform({ src, filename, options: babelOptions });
};
