import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Root');

export default function Index() {
  const { isAuthenticated } = useAuth();
  return <Redirect href={isAuthenticated ? '/(tabs)/book' : '/auth/login'} />;
}
