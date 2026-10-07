import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { paymentApi } from '../api/client';
import { lockoutCheckoutUrls } from '../../../shared/utils/mobileCheckoutUrls';
import { extractCheckoutUrl, formatCentsAsUsd, openStripeCheckout } from '../utils/payments';
import { unwrapApiPayload } from '../../../shared/api/core';
import { Button } from './Button';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';
import type { PaymentLockoutInfo } from '../paymentLockout/events';

interface PaymentLockoutScreenProps {
  lockout: PaymentLockoutInfo;
}

export function PaymentLockoutScreen({ lockout }: PaymentLockoutScreenProps) {
  const [amountCents, setAmountCents] = useState<number | null>(lockout.amountCents ?? null);
  const [description, setDescription] = useState<string | null>(lockout.description ?? null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (lockout.amountCents != null) {
      setAmountCents(lockout.amountCents);
      setDescription(lockout.description ?? null);
    }
    if (!lockout.facilityId) return;
    setLoadingInfo(true);
    void paymentApi.members
      .getLockoutInfo(lockout.facilityId)
      .then((res) => {
        if (!res.success || !res.data) return;
        const info =
          unwrapApiPayload<{ amountCents?: number; description?: string }>(res.data) ??
          (res.data as { amountCents?: number; description?: string });
        setAmountCents(info.amountCents ?? null);
        setDescription(info.description ?? null);
      })
      .finally(() => setLoadingInfo(false));
  }, [lockout.facilityId, lockout.amountCents, lockout.description]);

  const hasPayment = amountCents != null && amountCents > 0;

  async function handlePayNow() {
    if (!lockout.facilityId) {
      setCheckoutError('Missing facility information. Please contact your club.');
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    const urls = lockoutCheckoutUrls(lockout.facilityId);
    const res = await paymentApi.members.getLockoutCheckoutUrl(lockout.facilityId, urls);
    const url = extractCheckoutUrl(res.data);
    if (url && (await openStripeCheckout(url))) {
      setCheckingOut(false);
      return;
    }
    setCheckoutError(res.error || 'Could not open payment. Contact your facility administrator.');
    setCheckingOut(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={40} color={Colors.error} />
        </View>
        <Text style={styles.title}>Account Payment Required</Text>
        {lockout.facilityName ? (
          <Text style={styles.subtitle}>
            Your membership at <Text style={styles.bold}>{lockout.facilityName}</Text> is locked
            pending payment.
          </Text>
        ) : null}
        {loadingInfo ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
        ) : hasPayment ? (
          <View style={styles.amountBox}>
            <Text style={styles.amount}>{formatCentsAsUsd(amountCents)}</Text>
            {description ? <Text style={styles.amountDesc}>{description}</Text> : null}
          </View>
        ) : (
          <Text style={styles.subtitle}>
            Contact your facility administrator to resolve your balance and restore access.
          </Text>
        )}
        {lockout.lockedAt ? (
          <Text style={styles.lockedAt}>
            Locked on {new Date(lockout.lockedAt).toLocaleDateString()}
          </Text>
        ) : null}
        {checkoutError ? <Text style={styles.error}>{checkoutError}</Text> : null}
        {hasPayment ? (
          <Button
            title={checkingOut ? 'Opening Stripe…' : 'Pay Now to Restore Access'}
            onPress={handlePayNow}
            loading={checkingOut}
            disabled={!lockout.facilityId}
            style={styles.payButton}
          />
        ) : null}
        <Text style={styles.hint}>
          You will complete payment in Stripe, then return to CourtTime to restore access.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
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
  bold: { fontWeight: '600', color: Colors.text },
  amountBox: {
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: Spacing.md,
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  amount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.error,
  },
  amountDesc: {
    fontSize: FontSize.sm,
    color: '#b91c1c',
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  lockedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  error: {
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  payButton: { width: '100%', marginBottom: Spacing.sm },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
