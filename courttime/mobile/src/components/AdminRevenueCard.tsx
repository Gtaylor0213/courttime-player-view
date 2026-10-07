import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import {
  type AdminRevenueData,
  REVENUE_BREAKDOWN_ROWS,
  formatCentsAsDollars,
  formatRevenuePaidAt,
  revenuePaymentTypeLabel,
  transactionAmountCents,
  transactionMemberName,
  transactionPaidAt,
  transactionPaymentType,
} from '../utils/adminRevenue';

type Props = {
  data: AdminRevenueData | null;
  loading: boolean;
  error?: string | null;
};

export function AdminRevenueCard({ data, loading, error }: Props) {
  const [showTransactions, setShowTransactions] = useState(false);

  const thisMonthCents = data?.totals.thisMonthCents ?? 0;
  const breakdown = data?.breakdownCents ?? {};
  const transactions = data?.transactions ?? [];

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.cardTitle}>Revenue this month</Text>
          <Text style={styles.cardSubtitle}>From facility payment log</Text>
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name="cash-outline" size={22} color={Colors.primary} />
        </View>
      </View>

      {loading && !data ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Loading revenue…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <Text style={styles.totalAmount}>${formatCentsAsDollars(thisMonthCents)}</Text>

          <View style={styles.breakdown}>
            {REVENUE_BREAKDOWN_ROWS.map(({ type, label }) => {
              const cents = breakdown[type] ?? 0;
              return (
                <View key={type} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{label}</Text>
                  <Text style={styles.breakdownValue}>${formatCentsAsDollars(cents)}</Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setShowTransactions((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTransactions }}
          >
            <Text style={styles.toggleText}>
              {showTransactions ? 'Hide transactions' : 'View transactions'}
            </Text>
            <Ionicons
              name={showTransactions ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.primary}
            />
          </TouchableOpacity>

          {showTransactions && (
            <View style={styles.transactions}>
              {transactions.length === 0 ? (
                <Text style={styles.emptyText}>No transactions yet this period.</Text>
              ) : (
                transactions.map((tx) => (
                  <View key={tx.id} style={styles.txItem}>
                    <View style={styles.txMain}>
                      <Text style={styles.txTitle}>
                        {revenuePaymentTypeLabel(transactionPaymentType(tx))}
                      </Text>
                      <Text style={styles.txMember}>{transactionMemberName(tx)}</Text>
                    </View>
                    <View style={styles.txMeta}>
                      <Text style={styles.txAmount}>
                        ${formatCentsAsDollars(transactionAmountCents(tx))}
                      </Text>
                      <Text style={styles.txDate}>{formatRevenuePaidAt(transactionPaidAt(tx))}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerText: { flex: 1, paddingRight: Spacing.sm },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  loadingText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  errorText: { fontSize: FontSize.sm, color: Colors.error },
  totalAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  breakdownValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  toggleText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },
  transactions: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  txMain: { flex: 1, paddingRight: Spacing.sm },
  txMeta: { alignItems: 'flex-end' },
  txTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  txMember: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  txAmount: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  txDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
});
