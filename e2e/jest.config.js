module.exports = {
  testTimeout: 120000,
  reporters: ['detox/runners/jest/streamlineReporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  setupFilesAfterEnv: ['detox/runners/jest/jestSetup.js', './setup.js'],
};


