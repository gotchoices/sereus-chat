module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // @optimystic/db-p2p 0.28 ships static class blocks (e.g.
  // storage/block-latch.js).  The RN preset's Hermes target does not enable
  // them, so Metro fails the transform with a bare SyntaxError.
  plugins: ['@babel/plugin-transform-class-static-block'],
};
