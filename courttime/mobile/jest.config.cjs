const path = require('path');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Files under ../shared are outside this package, so Jest's default upward
  // walk never reaches mobile/node_modules (the only place @babel/runtime is
  // installed). Mirror metro.config.js's nodeModulesPaths.
  //
  moduleDirectories: ['node_modules', path.resolve(__dirname, 'node_modules')],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|standard-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
};
