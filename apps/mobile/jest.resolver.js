/**
 * Jest's half of "linked code resolves the app's copy" (docs/app-family.md; Metro's half
 * is in metro.config.js). A module under packages/* that imports one of @chat/core's
 * peer dependencies, or a Babel helper this app's transform inserted into it, resolves
 * as if this app had imported it. Everything else resolves normally.
 */
const path = require('path');

const appRoot = __dirname;
const packagesDir = path.resolve(appRoot, '../../packages') + path.sep;
const corePeers = Object.keys(
  require(path.join(packagesDir, 'core/package.json')).peerDependencies ?? {},
);
const fromApp = name =>
  name.startsWith('@babel/runtime/') || corePeers.some(p => name === p || name.startsWith(p + '/'));

module.exports = (request, options) =>
  options.basedir.startsWith(packagesDir) && fromApp(request)
    ? options.defaultResolver(request, { ...options, basedir: appRoot })
    : options.defaultResolver(request, options);
