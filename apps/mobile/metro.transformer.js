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
module.exports.transform = function transform({ src, filename, options }) {
  if (filename.endsWith('.qsql')) {
    const contents = fs.readFileSync(filename, 'utf8');
    const code = `module.exports = ${JSON.stringify(contents)};`;
    return upstreamTransformer.transform({ src: code, filename, options });
  }
  return upstreamTransformer.transform({ src, filename, options });
};
