/**
 * Deep-link return after web facility registration (`courttime://auth/register-facility-complete`).
 * Applies the JWT from the wizard, refreshes session, and routes to admin.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setToken } from '../../src/api/client';
import { useAuth } from '../../src/contexts/AuthContext';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Colors, FontSize, Spacing } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Register Facility Complete');

type Phase = 'signing-in' | 'success' | 'error';

export default function RegisterFacilityCompleteScreen() {
  const router = useRouter();
  const { refreshSession, setFacilityId } = useAuth();
  const { token, facilityId } = useLocalSearchParams<{ token?: string; facilityId?: string }>();
  const [phase, setPhase] = useState<Phase>('signing-in');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const authToken = typeof token === 'string' ? token.trim() : '';
    const newFacilityId = typeof facilityId === 'string' ? facilityId.trim() : '';

    if (!authToken || !newFacilityId) {
      setPhase('error');
      setErrorMessage('Registration link was incomplete. Try signing in with your new admin account.');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        await setToken(authToken);
        const ok = await refreshSession();
        if (!ok) {
          setPhase('error');
          setErrorMessage('Could not verify your session. Sign in with the admin account you created.');
          return;
        }

        setFacilityId(newFacilityId);
        setPhase('success');
        timer = setTimeout(() => {
          router.replace('/(tabs)/admin');
        }, 1200);
      } catch {
        setPhase('error');
        setErrorMessage('Something went wrong while signing you in. Please try again from the app.');
      }
    })();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [facilityId, refreshSession, router, setFacilityId, token]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Facility registration', headerShown: false }} />
      <View style={styles.content}>
        <Card padded style={styles.card}>
          {phase === 'signing-in' ? (
            <>
              <ActivityIndicator size="large" color={Colors.primary} style={styles.icon} />
              <Text style={styles.title}>Finishing setup…</Text>
              <Text style={styles.subtitle}>
                Signing you in and loading your new facility. This only takes a moment.
              </Text>
            </>
          ) : null}

          {phase === 'success' ? (
            <>
              <Ionicons name="checkmark-circle" size={52} color={Colors.success} style={styles.icon} />
              <Text style={styles.title}>Facility registered</Text>
              <Text style={styles.subtitle}>Opening your admin dashboard…</Text>
            </>
          ) : null}

          {phase === 'error' ? (
            <>
              <Ionicons name="alert-circle" size={52} color={Colors.error} style={styles.icon} />
              <Text style={styles.title}>Could not finish sign-in</Text>
              <Text style={styles.subtitle}>{errorMessage}</Text>
              <Button
                title="Go to sign in"
                onPress={() => router.replace('/auth/login')}
                style={styles.button}
              />
              <Button
                title="Try registration again"
                variant="secondary"
                onPress={() => router.replace('/auth/register-facility')}
                style={styles.button}
              />
            </>
          ) : null}
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: Spacing.md,
    alignSelf: 'stretch',
  },
});
