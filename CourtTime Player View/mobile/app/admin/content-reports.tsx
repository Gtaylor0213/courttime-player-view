/**
 * Admin Content Reports — web's AdminContentReports: bulletin and
 * hitting-partner posts members have flagged at this club, with remove /
 * dismiss. Reports about private messages go to the CourtTime team instead.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { moderationAdminApi, type ContentReport } from '../../src/api/moderation';
import { unwrapApiPayload } from '../../../shared/api/core';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Content Reports');

const TYPE_LABELS: Record<ContentReport['contentType'], string> = {
  message: 'Message',
  bulletin_post: 'Bulletin post',
  hitting_partner_post: 'Hitting partner post',
  user: 'Member',
};

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or bullying',
  inappropriate: 'Offensive or inappropriate',
  spam: 'Spam or scam',
  other: 'Something else',
};

export default function AdminContentReportsScreen() {
  const { facilityId } = useAuth();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const res = await moderationAdminApi.list(facilityId, status);
    if (res.success) setReports(unwrapApiPayload<{ reports?: ContentReport[] }>(res.data)?.reports ?? []);
    else showApiErrorAlert(res, 'Failed to load reports');
    setLoading(false);
  }, [facilityId, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function resolve(report: ContentReport, action: 'remove' | 'dismiss') {
    setBusyId(report.id);
    const res = await moderationAdminApi.resolve(report.id, action);
    setBusyId(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not update report');
      return;
    }
    await load();
  }

  function confirmRemove(report: ContentReport) {
    showAlert('Remove this post?', "It will be taken down for everyone. This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void resolve(report, 'remove') },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Stack.Screen options={{ title: 'Content Reports' }} />
      <Text style={styles.hint}>
        Posts your members have flagged. Review each within 24 hours. Reports about private messages are
        handled by the CourtTime team.
      </Text>

      <View style={styles.tabs}>
        {(['open', 'closed'] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.tab, status === value && styles.tabActive]}
            onPress={() => setStatus(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === value }}
          >
            <Text style={[styles.tabText, status === value && styles.tabTextActive]}>
              {value === 'open' ? 'Open' : 'Closed'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!loading && reports.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title={status === 'open' ? 'No open reports' : 'No closed reports yet'}
          description={status === 'open' ? 'Nothing needs your attention.' : undefined}
        />
      ) : null}

      {reports.map((report) => (
        <Card key={report.id} style={styles.card} padded>
          <View style={styles.badgeRow}>
            <Text style={styles.typeBadge}>{TYPE_LABELS[report.contentType]}</Text>
            <Text style={styles.reasonBadge}>{REASON_LABELS[report.reason] ?? report.reason}</Text>
          </View>
          <Text style={styles.meta}>
            {report.reportedUserName || 'A member'} was reported by {report.reporterName || 'a member'} on{' '}
            {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {report.status === 'resolved' ? ' · Removed' : report.status === 'dismissed' ? ' · Dismissed' : ''}
          </Text>
          {report.contentSnapshot ? <Text style={styles.snapshot}>{report.contentSnapshot}</Text> : null}
          {report.details ? <Text style={styles.details}>Reporter's note: {report.details}</Text> : null}
          {report.status === 'open' ? (
            <View style={styles.actions}>
              <Button
                title="Remove post"
                variant="destructive"
                onPress={() => confirmRemove(report)}
                loading={busyId === report.id}
                disabled={busyId !== null}
              />
              <Button
                title="Dismiss"
                variant="secondary"
                onPress={() => void resolve(report, 'dismiss')}
                disabled={busyId !== null}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  tabs: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tab: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.textInverse },
  card: { marginBottom: Spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeBadge: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  reasonBadge: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.destructive },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  snapshot: {
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  details: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
