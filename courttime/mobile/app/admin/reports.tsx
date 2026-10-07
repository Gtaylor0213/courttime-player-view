/**
 * Admin Reports — web's AdminReports: transactions by date range and type,
 * per-type summary, grand total, CSV export via the share sheet.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { getTransactionReport, type TransactionRow } from '../../src/api/admin';
import { unwrapApiPayload } from '../../../shared/api/core';
import { formatCentsAsUsd } from '../../src/utils/payments';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Reports');

const TYPE_LABELS: Record<string, string> = {
  court_booking: 'Court Booking',
  guest_fee: 'Guest Fee',
  bulletin_signup: 'Bulletin Signup',
  payment_item: 'Payment Item',
  annual_fee: 'Annual Fee',
  pro_shop: 'Pro Shop',
};
const TYPE_OPTIONS = [{ value: 'all', label: 'All Types' }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Same columns as web's exportCsv. Exported for tests. */
export function transactionsToCsv(rows: TransactionRow[]): string {
  const header = ['Date', 'Member', 'Email', 'Type', 'Description', 'Amount', 'Status'];
  const lines = rows.map((t) => [
    new Date(t.date).toLocaleDateString(),
    t.member_name ?? '',
    t.member_email ?? '',
    TYPE_LABELS[t.type] ?? t.type,
    `"${(t.description ?? '').replace(/"/g, '""')}"`,
    (t.amount_cents / 100).toFixed(2),
    t.status,
  ]);
  return [header, ...lines].map((r) => r.join(',')).join('\n');
}

export default function AdminReportsScreen() {
  const { facilityId } = useAuth();
  const now = new Date();
  const [start, setStart] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [end, setEnd] = useState(ymd(now));
  const [type, setType] = useState('all');
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [summary, setSummary] = useState<Array<{ type: string; total_cents: number; count: number }>>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const res = await getTransactionReport(facilityId, { start, end, type });
    setLoading(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Failed to load report');
      return;
    }
    const data = unwrapApiPayload<{ transactions?: TransactionRow[]; summary?: any[]; grandTotal?: number; grand_total_cents?: number }>(res.data);
    setRows(Array.isArray(data?.transactions) ? data.transactions : []);
    setSummary(Array.isArray(data?.summary) ? data.summary : []);
    setGrandTotal(Number(data?.grandTotal ?? data?.grand_total_cents ?? 0));
  }, [facilityId, start, end, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function exportCsv() {
    if (rows.length === 0) {
      showAlert('Export', 'No transactions to export.');
      return;
    }
    try {
      await Share.share({ title: `transactions-${start}-to-${end}.csv`, message: transactionsToCsv(rows) });
    } catch {
      /* dismissed */
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Filters</Text>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>From</Text>
            <Input value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>To</Text>
            <Input value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          </View>
        </View>
        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {TYPE_OPTIONS.map((o) => (
            <TouchableOpacity key={o.value} style={[styles.chip, type === o.value && styles.chipSelected]} onPress={() => setType(o.value)} accessibilityRole="button" accessibilityLabel={o.label}>
              <Text style={[styles.chipText, type === o.value && styles.chipTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button title="Export CSV" variant="secondary" onPress={() => void exportCsv()} disabled={rows.length === 0} style={{ marginTop: Spacing.sm }} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Summary</Text>
        {summary.length === 0 ? <Text style={styles.muted}>{loading ? 'Loading…' : 'No transactions in this range.'}</Text> : null}
        {summary.map((s) => (
          <View key={s.type} style={styles.kv}>
            <Text style={styles.k}>{TYPE_LABELS[s.type] ?? s.type} ({Number(s.count)})</Text>
            <Text style={styles.v}>{formatCentsAsUsd(Number(s.total_cents))}</Text>
          </View>
        ))}
        <View style={[styles.kv, styles.total]}>
          <Text style={styles.kTotal}>Grand total</Text>
          <Text style={styles.vTotal}>{formatCentsAsUsd(grandTotal)}</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Transactions ({rows.length})</Text>
        {rows.slice(0, 200).map((t) => (
          <View key={t.id} style={styles.txn}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txnTitle}>{t.member_name || 'Guest'} · {TYPE_LABELS[t.type] ?? t.type}</Text>
              <Text style={styles.muted}>{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {t.description}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.txnAmount}>{formatCentsAsUsd(t.amount_cents)}</Text>
              <Text style={styles.muted}>{t.status}</Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm },
  col: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  k: { fontSize: FontSize.sm, color: Colors.text },
  v: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  total: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.xs, paddingTop: Spacing.sm },
  kTotal: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  vTotal: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },
  txn: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  txnTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  txnAmount: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
});
