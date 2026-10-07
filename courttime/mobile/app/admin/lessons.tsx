/**
 * Admin Lessons — web's LessonsAdmin: upcoming and past lessons with rosters,
 * remove a participant, delete a lesson, and create one (BulletinPostCreateModal
 * in lesson mode).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api/client';
import { bulletinEndpoints } from '../../src/api/endpoints';
import { useAuth } from '../../src/contexts/AuthContext';
import { BulletinPostCreateModal } from '../../src/components/BulletinPostCreateModal';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showApiErrorAlert } from '../../src/utils/alert';
import { formatBulletinPostProminentDate, getLessonPostTypeLabel } from '../../../shared/utils/bulletinPostDisplay';
import { formatCentsAsUsd } from '../../src/utils/payments';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Lessons');

interface LessonRow {
  id: string;
  title: string;
  content?: string;
  type?: string;
  category?: string;
  drillStartAt?: string | null;
  drillCourtName?: string | null;
  drillMaxParticipants?: number;
  drillConfirmedCount?: number;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
  participants?: Array<{ userId: string; fullName: string; status: 'confirmed' | 'waitlist' | string; waitlistPosition?: number | null }>;
}

export default function AdminLessonsScreen() {
  const { facilityId } = useAuth();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const res = await api.get(`/api/lessons/${facilityId}?scope=${scope}`);
    if (res.success) {
      const posts = (res.data as { posts?: unknown })?.posts;
      setLessons(Array.isArray(posts) ? (posts as LessonRow[]) : []);
      setUnavailable(false);
    } else if ((res.error || '').toLowerCase().includes('not enabled')) {
      setUnavailable(true);
    }
    setLoading(false);
  }, [facilityId, scope]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmDelete(lesson: LessonRow) {
    Alert.alert('Delete lesson', `Delete "${lesson.title}"? Signed-up members will lose their spot.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(lesson.id);
            const res = await api.delete(`/api/bulletin-board/${lesson.id}`);
            setBusy(null);
            if (res.success) await load();
            else showApiErrorAlert(res, 'Failed to delete lesson');
          })();
        },
      },
    ]);
  }

  function confirmRemove(lesson: LessonRow, member: { userId: string; fullName: string }) {
    Alert.alert('Remove participant', `Remove ${member.fullName} from "${lesson.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(member.userId);
            const res = await bulletinEndpoints.adminRemoveSignup(lesson.id, member.userId);
            setBusy(null);
            if (res.success) await load();
            else showApiErrorAlert(res, 'Failed to remove participant');
          })();
        },
      },
    ]);
  }

  if (unavailable) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lessons' }} />
        <EmptyState icon="school-outline" title="Lessons are not enabled" description="Turn on the Lessons tab feature for this facility to manage lessons here." />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Lessons',
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowCreate(true)} accessibilityRole="button" accessibilityLabel="Create lesson" hitSlop={8}>
              <Ionicons name="add-circle" size={26} color={Colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.tabRow}>
        {(['upcoming', 'past'] as const).map((s) => (
          <TouchableOpacity key={s} style={[styles.tab, scope === s && styles.tabActive]} onPress={() => setScope(s)} accessibilityRole="button" accessibilityState={{ selected: scope === s }} accessibilityLabel={`${s} lessons`}>
            <Text style={[styles.tabText, scope === s && styles.tabTextActive]}>{s === 'upcoming' ? 'Upcoming' : 'Past'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {!loading && lessons.length === 0 ? (
          <EmptyState
            icon="school-outline"
            title={scope === 'upcoming' ? 'No upcoming lessons' : 'No past lessons yet'}
            description={scope === 'upcoming' ? 'Create a lesson or clinic to open sign-ups.' : 'Past lessons will show here with their rosters.'}
            actionLabel={scope === 'upcoming' ? 'Create lesson' : undefined}
            onAction={scope === 'upcoming' ? () => setShowCreate(true) : undefined}
          />
        ) : null}
        {lessons.map((lesson) => {
          const participants = lesson.participants || [];
          const confirmed = participants.filter((p) => p.status === 'confirmed');
          const waitlist = participants.filter((p) => p.status === 'waitlist').sort((a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));
          const open = expanded === lesson.id;
          return (
            <Card key={lesson.id} style={styles.card}>
              <TouchableOpacity onPress={() => setExpanded(open ? null : lesson.id)} accessibilityRole="button" accessibilityLabel={`${lesson.title}, ${open ? 'hide' : 'show'} roster`}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={2}>{lesson.title}</Text>
                  {getLessonPostTypeLabel(lesson) ? <Text style={styles.typeBadge}>{getLessonPostTypeLabel(lesson)}</Text> : null}
                </View>
                <Text style={styles.meta}>
                  {formatBulletinPostProminentDate(lesson, 'short')}
                  {lesson.drillCourtName ? ` · ${lesson.drillCourtName}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {lesson.drillConfirmedCount ?? confirmed.length}
                  {typeof lesson.drillMaxParticipants === 'number' ? ` / ${lesson.drillMaxParticipants}` : ''} signed up
                  {waitlist.length ? ` · ${waitlist.length} on waitlist` : ''}
                  {lesson.requirePayment && lesson.signupAmountCents ? ` · ${formatCentsAsUsd(lesson.signupAmountCents)}` : ' · Free'}
                </Text>
              </TouchableOpacity>
              {open ? (
                <View style={styles.roster}>
                  <Text style={styles.rosterTitle}>Roster ({confirmed.length})</Text>
                  {confirmed.length === 0 ? <Text style={styles.empty}>No signups yet.</Text> : null}
                  {confirmed.map((p) => (
                    <View key={p.userId} style={styles.rosterRow}>
                      <Text style={styles.rosterName}>{p.fullName}</Text>
                      {scope === 'upcoming' ? (
                        <TouchableOpacity onPress={() => confirmRemove(lesson, p)} disabled={busy !== null} accessibilityRole="button" accessibilityLabel={`Remove ${p.fullName}`}>
                          <Text style={styles.remove}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                  {waitlist.length ? <Text style={[styles.rosterTitle, { marginTop: Spacing.sm }]}>Waitlist</Text> : null}
                  {waitlist.map((p) => (
                    <View key={p.userId} style={styles.rosterRow}>
                      <Text style={styles.rosterName}>#{p.waitlistPosition} {p.fullName}</Text>
                      {scope === 'upcoming' ? (
                        <TouchableOpacity onPress={() => confirmRemove(lesson, p)} disabled={busy !== null} accessibilityRole="button" accessibilityLabel={`Remove ${p.fullName}`}>
                          <Text style={styles.remove}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                  {scope === 'upcoming' ? (
                    <Button title="Delete lesson" variant="destructive" onPress={() => confirmDelete(lesson)} loading={busy === lesson.id} disabled={busy !== null} style={{ marginTop: Spacing.sm }} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
      <BulletinPostCreateModal visible={showCreate} facilityId={facilityId ?? null} mode="lesson" onClose={() => setShowCreate(false)} onCreated={load} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', padding: Spacing.md, paddingBottom: 0, gap: Spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.sm },
  card: { padding: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  typeBadge: { fontSize: FontSize.xs, color: Colors.primary, backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2, overflow: 'hidden' },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  roster: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm, gap: 4 },
  rosterTitle: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  rosterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  rosterName: { fontSize: FontSize.sm, color: Colors.text, flexShrink: 1 },
  remove: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.error },
  empty: { fontSize: FontSize.xs, color: Colors.textMuted },
});
