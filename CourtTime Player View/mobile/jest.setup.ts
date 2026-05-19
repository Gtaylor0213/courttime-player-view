import './src/registerTextDefaults';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
    useSafeAreaInsets: () => insets,
    initialWindowMetrics: {
      insets,
      frame: { x: 0, y: 0, width: 390, height: 844 },
    },
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: { children?: unknown; style?: object }) =>
      React.createElement(View, { style: props.style }, props.children),
  };
});
