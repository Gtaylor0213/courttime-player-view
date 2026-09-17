/**
 * Admin Dashboard: revenue, booking/member stats, and status breakdown.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { Card } from '../../src/components/Card';
import { AdminRevenueCard } from '../../src/components/AdminRevenueCard';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { api } from '../../src/api/client';
import {
  getDashboardStats,
  getAnalytics,
  type AdminDashboardStats,
  type AdminStatusBreakdownRow,
} from '../../src/api/admin';
import { parseAdminRevenueResponse, type AdminRevenueData } from '../../src/utils/adminRevenue';

export const ErrorBoundary = createRouteErrorBoundary('Admin Dashboard');

const RANGE_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: Colors.success,
  completed: Colors.primary,
  cancelled: Colors.error,
  pending: Colors.warning,
};

function statLabel(n: number) {
  return n.toLocaleString('en-US');
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [rangeDays, setRangeDays] = useState(30);

  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [statusBreakdown, setStatusBreakdown] = useState<AdminStatusBreakdownRow[]>([]);
  const [revenueData, setRevenueData] = useState<AdminRevenueData | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const [dashRes, analyticsRes, revenueRes] = await Promise.all([
      getDashboardStats(facilityId),
      getAnalytics(facilityId, rangeDays),
      api.get(`/api/admin/revenue/${facilityId}?months=1&limit=50`),
    ]);

    if (dashRes.success && dashRes.data?.data) {
      setStats(dashRes.data.data.stats);
    }
    if (analyticsRes.success && analyticsRes.data?.data) {
      setStatusBreakdown(analyticsRes.data.data.statusBreakdown || []);
    }
    if (revenueRes.success) {
      const parsed = parseAdminRevenueResponse(revenueRes.data);
      setRevenueData(parsed);
      setRevenueError(parsed ? null : 'Could not read revenue data.');
    } else {
      setRevenueError(revenueRes.error || 'Could not load revenue.');
    }
    setLoading(false);
  }, [facilityId, rangeDays]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const totalStatusCount = statusBreakdown.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.days}
            style={[styles.rangeChip, rangeDays === opt.days && styles.rangeChipSelected]}
            onPress={() => setRangeDays(opt.days)}
          >
            <Text style={[styles.rangeChipText, rangeDays === opt.days && styles.rangeChipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <AdminRevenueCard data={revenueData} loading={loading} error={revenueError} />

      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{stats ? statLabel(stats.totalBookings) : '—'}</Text>
          <Text style={styles.statLabel}>Bookings this month</Text>
          {stats && stats.bookingsChange !== 0 ? (
            <Text style={[styles.statChange, stats.bookingsChange > 0 ? styles.statUp : styles.statDown]}>
              {stats.bookingsChange > 0 ? '+' : ''}
              {stats.bookingsChange}% vs last month
            </Text>
          ) : null}
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{stats ? statLabel(stats.activeMembers) : '—'}</Text>
          <Text style={styles.statLabel}>Active members</Text>
          {stats && stats.newMembers > 0 ? (
            <Text style={[styles.statChange, styles.statUp]}>+{stats.newMembers} new</Text>
          ) : null}
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{stats ? `${stats.courtUtilization}%` : '—'}</Text>
          <Text style={styles.statLabel}>Court utilization</Text>
        </Card>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Booking status ({rangeDays}d)</Text>
        {statusBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>No bookings in this range.</Text>
        ) : (
          statusBreakdown.map((row) => {
            const count = Number(row.count || 0);
            const pct = totalStatusCount > 0 ? Math.round((count / totalStatusCount) * 100) : 0;
            return (
              <View key={row.status} style={styles.statusRow}>
                <Text style={styles.statusLabel}>{row.status}</Text>
                <View style={styles.statusBarTrack}>
                  <View
                    style={[
                      styles.statusBarFill,
                      { width: `${pct}%`, backgroundColor: STATUS_COLORS[row.status] || Colors.textMuted },
                    ]}
                  />
                </View>
                <Text style={styles.statusCount}>{count}</Text>
              </View>
            );
          })
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Quick actions</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/admin/bookings')}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Create Reservation</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/admin/members')}>
            <Ionicons name="people-outline" size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Manage Members</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/admin/courts')}>
            <Ionicons name="settings-outline" size={20} color={Colors.primary} />
            <Text style={styles.quickActionText}>Court Settings</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  rangeRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rangeChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  rangeChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: FontFamily.medium },
  rangeChipTextSelected: { color: Colors.primary, fontWeight: '700' },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  statGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, padding: Spacing.sm, alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },
  statChange: { fontSize: FontSize.xs, fontWeight: '700', marginTop: 4 },
  statUp: { color: Colors.success },
  statDown: { color: Colors.error },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  statusLabel: { width: 80, fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  statusBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  statusBarFill: { height: '100%', borderRadius: BorderRadius.full },
  statusCount: { width: 30, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right' },
  quickActionsRow: { flexDirection: 'row', gap: Spacing.sm },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  quickActionText: { fontSize: FontSize.xs, color: Colors.text, textAlign: 'center', fontFamily: FontFamily.medium },
});
