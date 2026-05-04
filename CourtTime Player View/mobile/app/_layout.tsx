/**
 * Root Layout
 * Wraps the entire app with AuthProvider and handles auth-based routing
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/theme';
import { TermsAcceptanceGate } from '../src/components/TermsAcceptanceGate';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('App Shell');

function RootLayoutNav() {
  const { isAuthenticated, isLoading, pendingTermsAcceptances } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/book');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Handle notification tap — navigate to relevant screen (native only, not web)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'reservation_confirmed' || data?.type === 'reservation_cancelled' || data?.type === 'reservation_reminder') {
        router.push('/(tabs)/book');
      } else if (data?.type === 'message') {
        router.push('/(tabs)/messages');
      } else {
        router.push('/(tabs)/community');
      }
    });

    return () => subscription.remove();
  }, [router]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isAuthenticated && pendingTermsAcceptances.length > 0) {
    return <TermsAcceptanceGate />;
  }

  return (
    <Stack>
      {/* Tabs render their own header; auth screens are bare. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      {/* Top-level screens get the default Stack header with a back button. */}
      <Stack.Screen name="club-info" />
      <Stack.Screen name="notification-settings" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
