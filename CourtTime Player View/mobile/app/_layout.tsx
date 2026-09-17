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
import { FeatureFlagProvider } from '../src/contexts/FeatureFlagContext';
import { NotificationUnreadProvider } from '../src/contexts/NotificationUnreadContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../src/constants/theme';
import { TermsAcceptanceGate } from '../src/components/TermsAcceptanceGate';
import { GeneralRulesAcceptanceGate } from '../src/components/GeneralRulesAcceptanceGate';
import { MemberNumberGate } from '../src/components/MemberNumberGate';
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
  const { isAuthenticated, isLoading, pendingTermsAcceptances, pendingGeneralRulesAcceptances } = useAuth();
  // expo-router types this as a 1-tuple when typed routes aren't generated;
  // the runtime value is the full segment array and these routes are nested.
  const segments: string[] = useSegments();
  const router = useRouter();
  /** Only the top segment — avoids re-running this effect on every in-tab route change (can interrupt tab presses). */
  const rootSegment = segments[0];
  const isRegisterFacilityRoute =
    rootSegment === 'auth' &&
    (segments[1] === 'register-facility' || segments[1] === 'register-facility-complete');

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
    } else if (isAuthenticated && inAuthGroup && !isRegisterFacilityRoute) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, isRegisterFacilityRoute, rootSegment, router]);

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

  if (isAuthenticated && pendingGeneralRulesAcceptances.length > 0) {
    return <GeneralRulesAcceptanceGate />;
  }

  return (
    <>
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        {/* Tabs render their own header; auth screens are bare. */}
        <Stack.Screen
          name="(tabs)"
          options={{
            title: 'Home',
            headerShown: false,
            // Fade + native stack can leave the tab group receiving touches incorrectly in Expo Go.
            animation: 'none',
          }}
        />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        {/* Top-level screens get the default Stack header with a back button. */}
        <Stack.Screen name="club-info" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="my-reservations" options={{ title: 'My Reservations' }} />
        <Stack.Screen name="payments" options={{ title: 'Payments' }} />
        <Stack.Screen name="payment-success" options={{ title: 'Payment' }} />
          <Stack.Screen name="lockout-paid" options={{ title: 'Payment' }} />
        {/* Flagged features, reached from the More tab */}
        <Stack.Screen name="ball-machine" options={{ title: 'Ball Machine' }} />
        <Stack.Screen name="lessons" options={{ title: 'Lessons' }} />
        <Stack.Screen name="level-group" options={{ title: 'Player Groups' }} />
        <Stack.Screen name="pro-shop" options={{ title: 'Pro Shop' }} />
        <Stack.Screen name="padel/index" options={{ title: 'Padel' }} />
        <Stack.Screen name="padel/[sessionId]" options={{ title: 'Session' }} />
        {/* Admin sub-screens, reached from the Admin tab */}
        <Stack.Screen name="admin/dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="admin/bookings" options={{ title: 'Bookings' }} />
        <Stack.Screen name="admin/members" options={{ title: 'Members' }} />
        <Stack.Screen name="admin/courts" options={{ title: 'Courts & Facility' }} />
        <Stack.Screen name="admin/communication" options={{ title: 'Communication' }} />
        <Stack.Screen name="admin/member-payments" options={{ title: 'Member Payments' }} />
        <Stack.Screen name="admin/lessons" options={{ title: 'Lessons' }} />
        <Stack.Screen name="admin/facility" options={{ title: 'Facility Settings' }} />
        <Stack.Screen name="admin/households" options={{ title: 'Households' }} />
        <Stack.Screen name="admin/reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="admin/ball-machine" options={{ title: 'Ball Machine' }} />
      </Stack>
      {/*
        Rendered over the app rather than as an early return: unlike the terms
        and rules gates above, this one depends on the selected facility, which
        the member changes from inside the tabs.
      */}
      {isAuthenticated && <MemberNumberGate />}
    </>
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
          {/* Inside AuthProvider: flags are resolved per selected facility. */}
          <FeatureFlagProvider>
            <PaymentLockoutProvider>
            <NotificationUnreadProvider>
              <StatusBar style="auto" />
              <RootLayoutNav />
            </NotificationUnreadProvider>
            </PaymentLockoutProvider>
          </FeatureFlagProvider>
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
