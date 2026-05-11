import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../src/registerTextDefaults';
import { Sentry, hasSentryDsn } from '../src/utils/sentry';
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
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/theme';
import { TermsAcceptanceGate } from '../src/components/TermsAcceptanceGate';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('App Shell');

const BOOKING_PUSH_TYPES = new Set([
  'booking_confirmed',
  'booking_cancelled',
  'booking_reminder',
  'court_change',
  'reservation_confirmed',
  'reservation_cancelled',
  'reservation_reminder',
]);

function navigateFromNotificationData(
  router: ReturnType<typeof useRouter>,
  raw: Record<string, unknown> | undefined
) {
  if (!raw || typeof raw !== 'object') {
    router.push('/(tabs)/community');
    return;
  }
  const t = String(raw.type ?? '');
  const facilityId = raw.facilityId != null ? String(raw.facilityId) : undefined;
  const bookingDate = raw.bookingDate != null ? String(raw.bookingDate) : undefined;
  const bookingId = raw.bookingId != null ? String(raw.bookingId) : undefined;

  if (BOOKING_PUSH_TYPES.has(t)) {
    router.push({
      pathname: '/(tabs)/book',
      params: {
        ...(facilityId ? { facilityId } : {}),
        ...(bookingDate ? { bookingDate } : {}),
        ...(bookingId ? { bookingId } : {}),
      },
    });
    return;
  }
  if (t === 'message') {
    router.push('/(tabs)/messages');
    return;
  }
  router.push('/(tabs)/community');
}

function RootLayoutNav() {
  const { isAuthenticated, isLoading, pendingTermsAcceptances } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  /** Only the top segment — avoids re-running this effect on every in-tab route change (can interrupt tab presses). */
  const rootSegment = segments[0];

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = rootSegment === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/book');
    }
  }, [isAuthenticated, isLoading, rootSegment, router]);

  // Handle notification tap — navigate to relevant screen (native only, not web)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      navigateFromNotificationData(router, response.notification.request.content.data as Record<string, unknown>);
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
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: Colors.surface },
      }}
    >
      {/* Tabs render their own header; auth screens are bare. */}
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          // Fade + native stack can leave the tab group receiving touches incorrectly in Expo Go.
          animation: 'none',
        }}
      />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      {/* Top-level screens get the default Stack header with a back button. */}
      <Stack.Screen name="club-info" />
      <Stack.Screen name="notification-settings" />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootLayoutNav />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});

export default hasSentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
