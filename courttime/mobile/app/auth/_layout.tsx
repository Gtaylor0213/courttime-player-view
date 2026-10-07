import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Auth');

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
