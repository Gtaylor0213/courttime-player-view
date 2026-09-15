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
  // expo/node_modules is needed because npm nests expo-modules-core there
  // rather than hoisting it: expo-modules-core's optional peer range for
  // react-native-worklets stops at 0.10, but expo-router pulls reanimated 4,
  // which needs 0.12. jest-expo's preset requires expo-modules-core by bare
  // specifier, so without this it resolves nothing.
  moduleDirectories: [
    'node_modules',
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, 'node_modules/expo/node_modules'),
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|standard-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
};
