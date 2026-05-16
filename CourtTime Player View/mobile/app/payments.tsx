/**
 * Member payments — dues, clinics, drills, ball machine (Stripe Connect catalog).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { paymentApi } from '../src/api/client';
import type { ConnectPayment, PaymentCategory, PaymentItem } from '../src/api/payments';
import { memberPaymentCheckoutUrls } from '../../shared/utils/mobileCheckoutUrls';
import {
  extractCheckoutUrl,
  formatCentsAsUsd,
  openStripeCheckout,
} from '../src/utils/payments';
import { showAlert } from '../src/utils/alert';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Colors, FontSize, Spacing, BorderRadius } from '../src/constants/theme';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Payments');

const CATEGORY_LABELS: Record<PaymentCategory, string> = {
  BALL_MACHINE: 'Ball machine',
  CLINIC: 'Clinic',
  DRILL: 'Drill',
  DUES: 'Dues',
  OTHER: 'Other',
};

function listFromResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const record = data as { data?: T[] };
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

function PaymentStatusBadge({ status }: { status: ConnectPayment['status'] }) {
  const colors =
    status === 'PAID'
      ? { bg: '#dcfce7', text: '#166534' }
      : status === 'PENDING'
        ? { bg: '#fef9c3', text: '#854d0e' }
        : status === 'FAILED'
          ? { bg: '#fee2e2', text: '#991b1b' }
          : { bg: Colors.surface, text: Colors.textMuted };
  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.statusBadgeText, { color: colors.text }]}>{status}</Text>
    </View>
  );
}

export default function PaymentsScreen() {
  const { facilityId, facilities } = useAuth();
  const facilityName = facilities?.find((f) => f.id === facilityId)?.name;
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [history, setHistory] = useState<ConnectPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) {
      setItems([]);
      setHistory([]);
      setLoading(false);
      return;
    }
    setError(null);
    const [itemsRes, historyRes] = await Promise.all([
      paymentApi.paymentItems.list(facilityId),
      paymentApi.connectPayments.myHistory(facilityId),
    ]);
    if (itemsRes.success) {
      const list = listFromResponse<PaymentItem>(itemsRes.data);
      setItems(list.filter((i) => i.isActive));
    } else {
      setError(itemsRes.error || 'Failed to load payment items');
    }
    if (historyRes.success) {
      setHistory(listFromResponse<ConnectPayment>(historyRes.data));
    }
    setLoading(false);
    setRefreshing(false);
  }, [facilityId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const groupedItems = useMemo(() => {
    const groups = new Map<PaymentCategory, PaymentItem[]>();
    for (const item of items) {
      const arr = groups.get(item.category) ?? [];
      arr.push(item);
      groups.set(item.category, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  async function handlePay(item: PaymentItem) {
    setPayingId(item.id);
    const urls = memberPaymentCheckoutUrls();
    const res = await paymentApi.connectPayments.checkout({
      paymentItemId: item.id,
      ...urls,
    });
    const url = extractCheckoutUrl(res.data);
    if (res.success && url && (await openStripeCheckout(url))) {
      setPayingId(null);
      return;
    }
    showAlert('Checkout', res.error || 'Could not start checkout. Try again.');
    setPayingId(null);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Payments' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <Text style={styles.lead}>
          Pay your club for dues, clinics, drills, and other fees
          {facilityName ? ` at ${facilityName}` : ''}.
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : !facilityId ? (
          <Card padded>
            <Text style={styles.emptyTitle}>Select a club</Text>
            <Text style={styles.emptyDesc}>Choose a facility from the header to see payment options.</Text>
          </Card>
        ) : items.length === 0 ? (
          <Card padded>
            <Text style={styles.emptyTitle}>Nothing to pay right now</Text>
            <Text style={styles.emptyDesc}>Your club has not published any payment options yet.</Text>
          </Card>
        ) : (
          groupedItems.map(([category, list]) => (
            <View key={category} style={styles.section}>
              <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category]}</Text>
              {list.map((item) => (
                <Card key={item.id} style={styles.itemCard} padded>
                  <View style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.itemDesc}>{item.description}</Text>
                      ) : null}
                      {item.isRecurring ? (
                        <Text style={styles.recurring}>
                          Recurring · every {item.recurringInterval}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.itemActions}>
                      <Text style={styles.itemPrice}>{formatCentsAsUsd(item.amountCents)}</Text>
                      <Button
                        title={payingId === item.id ? 'Opening…' : 'Pay now'}
                        onPress={() => handlePay(item)}
                        loading={payingId === item.id}
                        style={styles.payBtn}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment history</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyDesc}>No payments yet at this club.</Text>
          ) : (
            history.map((p) => (
              <Card key={p.id} style={styles.historyRow} padded>
                <View style={styles.historyMain}>
                  <Text style={styles.historyItem}>{p.itemName || 'Payment'}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(p.paidAt || p.createdAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.historyEnd}>
                  <Text style={styles.historyAmount}>{formatCentsAsUsd(p.amountCents)}</Text>
                  <PaymentStatusBadge status={p.status} />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  lead: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  itemCard: { marginBottom: Spacing.sm },
  itemRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  itemDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  recurring: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 4 },
  itemActions: { alignItems: 'flex-end', gap: Spacing.sm },
  itemPrice: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  payBtn: { minWidth: 100 },
  historyRow: { marginBottom: Spacing.sm },
  historyMain: { flex: 1 },
  historyEnd: { alignItems: 'flex-end', gap: 4 },
  historyItem: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  historyDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  historyAmount: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
});
