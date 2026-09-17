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
  getFullAnalytics,
  type AdminAnalytics,
  type AdminDashboardStats,
  type AdminRecentActivityItem,
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
  const [analytics, setAnalytics] = useState<Partial<AdminAnalytics>>({});
  const [recentActivity, setRecentActivity] = useState<AdminRecentActivityItem[]>([]);
  const [revenueData, setRevenueData] = useState<AdminRevenueData | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const [dashRes, analyticsRes, revenueRes] = await Promise.all([
      getDashboardStats(facilityId),
      getFullAnalytics(facilityId, rangeDays),
      api.get(`/api/admin/revenue/${facilityId}?months=1&limit=50`),
    ]);

    if (dashRes.success && dashRes.data?.data) {
      setStats(dashRes.data.data.stats);
      setRecentActivity(dashRes.data.data.recentActivity || []);
    }
    if (analyticsRes.success && analyticsRes.data?.data) {
      setStatusBreakdown(analyticsRes.data.data.statusBreakdown || []);
      setAnalytics(analyticsRes.data.data);
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

      {/* Web AdminDashboard analytics sections, phone-sized */}
      <BarCard title={`Booking trends (${rangeDays}d)`} rows={(analytics.bookingsTrend || []).slice(-14).map((r) => ({ label: String(r.date).slice(5, 10), value: Number(r.bookings) }))} empty="No booking data available." />
      <BarCard title="Bookings by day of week" rows={(analytics.dayOfWeek || []).map((r) => ({ label: DOW[Number(r.day_of_week)] ?? String(r.day_of_week), value: Number(r.bookings) }))} empty="No day of week data available." />
      <BarCard title="Peak hours" rows={(analytics.peakHours || []).map((r) => ({ label: hourLabel(Number(r.hour)), value: Number(r.bookings) }))} empty="No peak hours data available." />
      <BarCard title="Court comparison" rows={(analytics.courtUsage || []).map((r) => ({ label: r.court_name, value: Number(r.bookings) }))} empty="No court data available." />
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Court utilization details</Text>
        {(analytics.courtUtilization || []).length === 0 ? (
          <Text style={styles.emptyText}>No court data available.</Text>
        ) : (
          (analytics.courtUtilization || []).map((r) => (
            <View key={r.court_name} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{r.court_name}</Text>
              <Text style={styles.kvValue}>{Number(r.total_bookings)} bookings · {(Number(r.total_minutes_booked) / 60).toFixed(1)} h</Text>
            </View>
          ))
        )}
      </Card>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Booking heatmap</Text>
        <Text style={styles.emptyText}>Bookings by weekday and hour; darker is busier.</Text>
        <Heatmap rows={analytics.heatmap || []} />
      </Card>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Top members by bookings</Text>
        {(analytics.topBookers || []).length === 0 ? (
          <Text style={styles.emptyText}>No member data available.</Text>
        ) : (
          (analytics.topBookers || []).slice(0, 10).map((r, i) => (
            <View key={`${r.member_name}-${i}`} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{i + 1}. {r.member_name}</Text>
              <Text style={styles.kvValue}>{Number(r.booking_count)} · {(Number(r.total_minutes) / 60).toFixed(1)} h</Text>
            </View>
          ))
        )}
      </Card>
      <BarCard title="Member growth" rows={(analytics.memberGrowth || []).slice(-14).map((r) => ({ label: String(r.date).slice(5, 10), value: Number(r.new_members) }))} empty="No member growth data available." />
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Recent activity</Text>
        {recentActivity.length === 0 ? (
          <Text style={styles.emptyText}>No recent activity.</Text>
        ) : (
          recentActivity.slice(0, 10).map((a) => (
            <View key={a.id} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{a.userName} · {a.courtName}</Text>
              <Text style={styles.kvValue}>{String(a.bookingDate).slice(0, 10)} · {String(a.startTime).slice(0, 5)} · {a.status}</Text>
            </View>
          ))
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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function hourLabel(h: number): string {
  if (!Number.isFinite(h)) return '';
  return `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`;
}

/** Horizontal bar list — enough to read trends without a chart library. */
function BarCard({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: number }>; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {rows.length === 0 || max === 0 ? (
        <Text style={styles.emptyText}>{empty}</Text>
      ) : (
        rows.map((r, i) => (
          <View key={`${r.label}-${i}`} style={styles.statusRow}>
            <Text style={styles.statusLabel} numberOfLines={1}>{r.label}</Text>
            <View style={styles.statusBarTrack}>
              <View style={[styles.statusBarFill, { width: `${Math.round((r.value / max) * 100)}%`, backgroundColor: Colors.primary }]} />
            </View>
            <Text style={styles.statusCount}>{r.value}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

function Heatmap({ rows }: { rows: Array<{ day_of_week: string | number; hour: string | number; bookings: string | number }> }) {
  const hours = Array.from({ length: 17 }, (_, i) => 6 + i); // 6am–10pm
  const byKey = new Map<string, number>();
  let max = 0;
  rows.forEach((r) => {
    const v = Number(r.bookings) || 0;
    byKey.set(`${Number(r.day_of_week)}-${Number(r.hour)}`, v);
    if (v > max) max = v;
  });
  if (max === 0) return <Text style={styles.emptyText}>No bookings in this range.</Text>;
  return (
    <View style={{ marginTop: Spacing.sm }}>
      {DOW.map((d, dow) => (
        <View key={d} style={styles.heatRow}>
          <Text style={styles.heatLabel}>{d}</Text>
          {hours.map((h) => {
            const v = byKey.get(`${dow}-${h}`) || 0;
            const alpha = v === 0 ? 0.06 : 0.2 + 0.8 * (v / max);
            return <View key={h} style={[styles.heatCell, { backgroundColor: Colors.primary, opacity: alpha }]} accessibilityLabel={`${d} ${hourLabel(h)}: ${v}`} />;
          })}
        </View>
      ))}
      <View style={styles.heatRow}>
        <Text style={styles.heatLabel} />
        {hours.map((h) => (
          <Text key={h} style={styles.heatHour}>{h % 4 === 2 ? hourLabel(h) : ''}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  kvLabel: { fontSize: FontSize.xs, color: Colors.text, flexShrink: 1 },
  kvValue: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'right', flexShrink: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2 },
  heatLabel: { width: 28, fontSize: 9, color: Colors.textSecondary },
  heatCell: { flex: 1, height: 12, borderRadius: 2 },
  heatHour: { flex: 1, fontSize: 8, color: Colors.textMuted, textAlign: 'center' },
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
