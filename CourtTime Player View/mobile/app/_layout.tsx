import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../src/registerTextDefaults';
import { Sentry, hasSentryDsn } from '../src/utils/sentry';
/**
 * Root Layout
 * Wraps the entire app with AuthProvider and handles auth-based routing
 */

import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { PaymentLockoutProvider } from '../src/contexts/PaymentLockoutContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/theme';
import { TermsAcceptanceGate } from '../src/components/TermsAcceptanceGate';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import {
  getNotificationData,
  isStartupNotificationResponseFresh,
  markNotificationResponseHandled,
  navigateFromNotificationData,
  wasNotificationResponseHandledRecently,
} from '../src/utils/notificationNavigation';

export const ErrorBoundary = createRouteErrorBoundary('App Shell');

function RootLayoutNav() {
  const { isAuthenticated, isLoading, pendingTermsAcceptances } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  /** Only the top segment — avoids re-running this effect on every in-tab route change (can interrupt tab presses). */
  const rootSegment = segments[0];

  const clearLastNotificationResponse = useCallback(async () => {
    try {
      await Notifications.clearLastNotificationResponseAsync();
    } catch {
      // Older cached responses should never block the current session.
    }
  }, []);

  const handleNotificationResponse = useCallback(
    async (
      response: Notifications.NotificationResponse | null,
      source: 'startup' | 'listener'
    ) => {
      if (!response) return;

      if (source === 'startup') {
        if (!isStartupNotificationResponseFresh(response)) {
          await clearLastNotificationResponse();
          return;
        }

        if (await wasNotificationResponseHandledRecently(response)) {
          await clearLastNotificationResponse();
          return;
        }
      }

      navigateFromNotificationData(router, getNotificationData(response));

      await Promise.allSettled([
        markNotificationResponseHandled(response),
        clearLastNotificationResponse(),
      ]);
    },
    [clearLastNotificationResponse, router]
  );

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = rootSegment === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, rootSegment, router]);

  // Handle notification tap — navigate to relevant screen (native only, not web)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    void (async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (cancelled) return;
      await handleNotificationResponse(response, 'startup');
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void handleNotificationResponse(response, 'listener');
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [handleNotificationResponse]);

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
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="payment-success" options={{ title: 'Payment' }} />
      <Stack.Screen name="lockout-paid" options={{ title: 'Payment' }} />
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
          <PaymentLockoutProvider>
            <StatusBar style="auto" />
            <RootLayoutNav />
          </PaymentLockoutProvider>
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
