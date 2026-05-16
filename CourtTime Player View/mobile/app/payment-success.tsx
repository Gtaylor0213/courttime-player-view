/**
 * Return screen after Stripe checkout for catalog payments (dues, etc.).
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { paymentApi } from '../src/api/client';
import type { ConnectPayment } from '../src/api/payments';
import { formatCentsAsUsd } from '../src/utils/payments';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Colors, FontSize, Spacing } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Payment Success');

function listFromResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const record = data as { data?: T[] };
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { session_id: sessionId } = useLocalSearchParams<{ session_id?: string }>();
  const [payment, setPayment] = useState<ConnectPayment | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollOnce = async () => {
      attempts += 1;
      const res = await paymentApi.connectPayments.myHistory();
      if (cancelled) return;
      if (res.success) {
        const list = listFromResponse<ConnectPayment>(res.data);
        const found =
          (sessionId
            ? list.find((p) => p.stripeCheckoutSessionId === sessionId)
            : undefined) ?? list[0] ?? null;
        if (found) setPayment(found);
        if (found?.status === 'PAID') {
          setConfirmed(true);
          return;
        }
      }
      if (!cancelled && attempts < 8) {
        timer = setTimeout(pollOnce, 1500);
      }
    };

    void pollOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <>
      <Stack.Screen options={{ title: 'Payment' }} />
      <View style={styles.container}>
        <Card padded style={styles.card}>
          <Ionicons
            name={confirmed ? 'checkmark-circle' : 'time-outline'}
            size={48}
            color={confirmed ? Colors.success : Colors.warning}
            style={styles.icon}
          />
          <Text style={styles.title}>
            {confirmed ? 'Payment received' : 'Processing your payment…'}
          </Text>
          <Text style={styles.subtitle}>
            {confirmed
              ? 'Thanks! Your club has been credited.'
              : 'Stripe is confirming your payment. This usually takes a moment.'}
          </Text>
          {!confirmed ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} /> : null}
          {payment ? (
            <View style={styles.details}>
              <Row label="Item" value={payment.itemName || '—'} />
              <Row label="Amount" value={formatCentsAsUsd(payment.amountCents)} />
              <Row label="Status" value={payment.status.toLowerCase()} />
            </View>
          ) : null}
          <Button title="Back to payments" onPress={() => router.replace('/payments')} style={styles.btn} />
          <Button
            title="Court calendar"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/book')}
            style={styles.btn}
          />
        </Card>
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
    marginBottom: Spacing.md,
  },
  details: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  rowValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  btn: { width: '100%', marginTop: Spacing.sm },
});
