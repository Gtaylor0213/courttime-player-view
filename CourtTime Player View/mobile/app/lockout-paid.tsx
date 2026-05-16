/**
 * Return screen after Stripe checkout for payment lockout.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { paymentApi } from '../src/api/client';
import { unwrapApiPayload } from '../../shared/api/core';
import { usePaymentLockout } from '../src/contexts/PaymentLockoutContext';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Colors, FontSize, Spacing } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Lockout Paid');

export default function LockoutPaidScreen() {
  const router = useRouter();
  const { clearLockout, refreshLockout } = usePaymentLockout();
  const { facilityId, session_id: sessionId } = useLocalSearchParams<{
    facilityId?: string;
    session_id?: string;
  }>();
  const [status, setStatus] = useState<'confirming' | 'unlocked' | 'waiting'>('confirming');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!facilityId) {
      setStatus('waiting');
      setError('Missing facility information from payment return.');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finishUnlocked = () => {
      if (cancelled) return;
      clearLockout();
      setStatus('unlocked');
      timer = setTimeout(() => {
        router.replace('/(tabs)/book');
      }, 1500);
    };

    const pollLockoutCleared = async () => {
      attempts += 1;
      const res = await paymentApi.members.getLockoutInfo(facilityId);
      const info = unwrapApiPayload<{ isLocked?: boolean }>(res.data) ?? (res.data as { isLocked?: boolean });
      if (!cancelled && res.success && info?.isLocked === false) {
        finishUnlocked();
        return;
      }
      if (!cancelled && attempts < 12) {
        setStatus('waiting');
        timer = setTimeout(pollLockoutCleared, 1500);
      } else if (!cancelled) {
        setError('Payment is still processing. Try refreshing in a moment.');
        setStatus('waiting');
      }
    };

    const confirmPayment = async () => {
      if (sessionId && sessionId !== '{CHECKOUT_SESSION_ID}') {
        try {
          const res = await paymentApi.members.confirmLockoutPayment(facilityId, sessionId);
          const payload =
            unwrapApiPayload<{ unlocked?: boolean }>(res.data) ??
            (res.data as { unlocked?: boolean });
          if (!cancelled && res.success && payload?.unlocked) {
            finishUnlocked();
            return;
          }
          if (!cancelled && res.success) {
            await pollLockoutCleared();
            return;
          }
          if (!cancelled && !res.success) {
            setError(res.error || 'Could not confirm payment yet.');
          }
        } catch {
          if (!cancelled) setError('Could not confirm payment yet.');
        }
      }
      if (!cancelled) {
        setStatus('waiting');
        await pollLockoutCleared();
      }
    };

    void confirmPayment();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [facilityId, sessionId, clearLockout, router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Payment' }} />
      <View style={styles.container}>
        <Card padded style={styles.card}>
          <Ionicons
            name={status === 'unlocked' ? 'checkmark-circle' : 'time-outline'}
            size={48}
            color={status === 'unlocked' ? Colors.success : Colors.warning}
            style={styles.icon}
          />
          <Text style={styles.title}>
            {status === 'unlocked'
              ? 'Access restored'
              : status === 'confirming'
                ? 'Confirming your payment…'
                : 'Processing your payment…'}
          </Text>
          <Text style={styles.subtitle}>
            {status === 'unlocked'
              ? 'Redirecting you to the court calendar…'
              : 'Your payment was received. Unlocking your account now.'}
          </Text>
          {status !== 'unlocked' ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {status !== 'unlocked' ? (
            <Button
              title="Refresh status"
              variant="secondary"
              onPress={() => {
                setError(null);
                setStatus('confirming');
                void refreshLockout().then(() => {
                  if (!facilityId) return;
                  void paymentApi.members.getLockoutInfo(facilityId).then((res) => {
                    const info =
                      unwrapApiPayload<{ isLocked?: boolean }>(res.data) ??
                      (res.data as { isLocked?: boolean });
                    if (res.success && info?.isLocked === false) {
                      clearLockout();
                      router.replace('/(tabs)/book');
                    }
                  });
                });
              }}
              style={styles.btn}
            />
          ) : null}
        </Card>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: { alignItems: 'center' },
  icon: { marginBottom: Spacing.md },
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
  error: {
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  btn: { width: '100%', marginTop: Spacing.lg },
});
