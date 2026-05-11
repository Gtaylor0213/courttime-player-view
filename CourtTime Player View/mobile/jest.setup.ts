import './src/registerTextDefaults';

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: { children?: unknown; style?: object }) =>
      React.createElement(View, { style: props.style }, props.children),
  };
});
