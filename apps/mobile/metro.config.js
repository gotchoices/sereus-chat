const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Project root is two levels up (chat/)
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    // Watch the shared mock folder at project root
    path.resolve(projectRoot, 'mock'),
  ],
  resolver: {
    // Allow imports from outside the app folder
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
    ],
    // Enable symlink support
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
