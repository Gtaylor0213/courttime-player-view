/**
 * Padel session — roster, standings, rounds and match scores.
 *
 * Mirrors web's `padel/PadelSessionStandings.tsx`: the host (or a facility
 * admin) records scores, generates the next round once the current one is
 * complete, and can cancel an unstarted session; everyone else watches.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { padelEndpoints } from '../../src/api/endpoints';
import { showAlert } from '../../src/utils/alert';
import { hapticError, hapticSuccess } from '../../src/utils/haptics';
import { useAuth } from '../../src/contexts/AuthContext';
import { EmptyState } from '../../src/components/EmptyState';
import { Input } from '../../src/components/Input';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Padel Session');

interface MatchView {
  id: string;
  courtId: string | null;
  courtName: string | null;
  team1: [string, string];
  team2: [string, string];
  team1Score: number | null;
  team2Score: number | null;
}
interface RoundView {
  id: string;
  roundNumber: number;
  status: string;
  matches: MatchView[];
}
interface SessionDetail {
  session: {
    id: string;
    facilityId?: string;
    format: 'americano' | 'mexicano' | string;
    sessionDate: string;
    startTime: string;
    status: string;
    createdBy: string;
    hostName?: string;
    playerCount: number;
    roundsCount: number;
  };
  roster: Array<{ userId: string; fullName: string; isHost: boolean; paymentStatus?: string }>;
  rounds: RoundView[];
}
interface StandingRow {
  userId: string;
  fullName: string;
  points: number;
  matchesPlayed?: number;
}

/** Host-only controls apply once every match in the latest round has a score. Exported for tests. */
export function canGenerateNextRound(
  detail: Pick<SessionDetail, 'session' | 'rounds'>,
  isHost: boolean
): boolean {
  const latest = detail.rounds[detail.rounds.length - 1];
  const latestComplete = !!latest && latest.matches.every((m) => m.team1Score !== null && m.team2Score !== null);
  return isHost && detail.session.status === 'in_progress' && latestComplete && detail.rounds.length < detail.session.roundsCount;
}

export default function PadelSessionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { sessionId: raw } = useLocalSearchParams<{ sessionId: string | string[] }>();
  const sessionId = Array.isArray(raw) ? raw[0] : raw;

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { team1: string; team2: string }>>({});

  const load = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    const [detailRes, standingsRes] = await Promise.all([
      padelEndpoints.detail(sessionId),
      padelEndpoints.standings(sessionId),
    ]);
    if (detailRes.success) {
      const d = detailRes.data as Partial<SessionDetail> | undefined;
      setDetail(d?.session ? { session: d.session, roster: d.roster ?? [], rounds: d.rounds ?? [] } : null);
    } else {
      setDetail(null);
    }
    if (standingsRes.success) {
      const list = (standingsRes.data as { standings?: unknown })?.standings;
      setStandings(Array.isArray(list) ? (list as StandingRow[]) : []);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const nameFor = (userId: string) => detail?.roster.find((p) => p.userId === userId)?.fullName || 'Player';

  async function submitScore(matchId: string) {
    const draft = drafts[matchId];
    if (!draft || draft.team1 === '' || draft.team2 === '') {
      showAlert('Score', 'Enter both team scores.');
      return;
    }
    setBusy(true);
    const res = await padelEndpoints.recordScore(matchId, Number(draft.team1), Number(draft.team2));
    setBusy(false);
    if (res.success) {
      hapticSuccess();
      await load();
    } else {
      hapticError();
      showAlert('Score', res.error || 'Could not record score.');
    }
  }

  async function nextRound() {
    if (!sessionId) return;
    setBusy(true);
    const res = await padelEndpoints.nextRound(sessionId);
    setBusy(false);
    if (res.success) {
      hapticSuccess();
      await load();
    } else {
      hapticError();
      showAlert('Next round', res.error || 'Could not generate next round.');
    }
  }

  function confirmCancel() {
    if (!sessionId) return;
    Alert.alert(
      'Cancel Session?',
      "This cancels the session for everyone. Any player who already paid will be automatically refunded. This can't be undone.",
      [
        { text: 'Keep Session', style: 'cancel' },
        {
          text: 'Yes, Cancel Session',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              const res = await padelEndpoints.cancel(sessionId);
              setBusy(false);
              if (res.success) {
                hapticSuccess();
                showAlert('Session cancelled', 'Any paid players have been refunded.');
                router.back();
              } else {
                hapticError();
                showAlert('Cancel', res.error || 'Could not cancel session.');
              }
            })();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Session' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <>
        <Stack.Screen options={{ title: 'Session' }} />
        <EmptyState icon="trophy-outline" title="Session not found" description="It may have been cancelled." />
      </>
    );
  }

  const { session, roster, rounds } = detail;
  const isHost =
    !!user && (session.createdBy === user.id || (!!session.facilityId && (user.adminFacilities ?? []).includes(session.facilityId)));
  const showNextRound = canGenerateNextRound(detail, isHost);
  const canCancel = isHost && ['open', 'full'].includes(session.status);
  const title = `${session.format === 'americano' ? 'Americano' : session.format === 'mexicano' ? 'Mexicano' : session.format} — ${session.sessionDate}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Session' }} />

      <View style={styles.titleRow}>
        <Ionicons name="trophy-outline" size={20} color={Colors.primary} />
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{session.status.replace('_', ' ')}</Text>
        </View>
      </View>
      {canCancel ? (
        <TouchableOpacity style={styles.dangerButton} onPress={confirmCancel} disabled={busy} accessibilityRole="button" accessibilityLabel="Cancel session">
          <Text style={styles.dangerButtonText}>Cancel Session</Text>
        </TouchableOpacity>
      ) : null}

      {['open', 'full'].includes(session.status) ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Roster</Text>
          {roster.map((p) => (
            <View key={p.userId} style={styles.row}>
              <Text style={styles.rowText}>
                {p.fullName}
                {p.isHost ? <Text style={styles.muted}> (host)</Text> : null}
              </Text>
              {p.paymentStatus === 'pending' ? <Text style={styles.tag}>Payment pending</Text> : null}
              {p.paymentStatus === 'refunded' ? <Text style={styles.tag}>Refunded</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Standings</Text>
        {standings.length === 0 ? (
          <Text style={styles.muted}>No scores recorded yet.</Text>
        ) : (
          standings.map((row, idx) => (
            <View key={row.userId} style={styles.row}>
              <Text style={styles.rowText}>
                <Text style={styles.muted}>{idx + 1}. </Text>
                {row.fullName}
              </Text>
              <Text style={styles.points}>
                {row.points} pts{typeof row.matchesPlayed === 'number' ? <Text style={styles.muted}> ({row.matchesPlayed} matches)</Text> : null}
              </Text>
            </View>
          ))
        )}
      </View>

      {rounds.map((round) => (
        <View key={round.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Round {round.roundNumber}</Text>
            <View style={[styles.badge, round.status === 'completed' && styles.badgeDone]}>
              <Text style={[styles.badgeText, round.status === 'completed' && styles.badgeDoneText]}>{round.status}</Text>
            </View>
          </View>
          {round.matches.map((match) => {
            const scored = match.team1Score !== null && match.team2Score !== null;
            const draft = drafts[match.id] || { team1: '', team2: '' };
            return (
              <View key={match.id} style={styles.match}>
                <Text style={styles.muted}>{match.courtName || 'Court TBD'}</Text>
                <View style={styles.matchRow}>
                  <View style={styles.teams}>
                    <Text style={styles.rowText}>{nameFor(match.team1[0])} / {nameFor(match.team1[1])}</Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text style={styles.rowText}>{nameFor(match.team2[0])} / {nameFor(match.team2[1])}</Text>
                  </View>
                  {scored ? (
                    <Text style={styles.score}>
                      {match.team1Score} – {match.team2Score}
                    </Text>
                  ) : isHost ? (
                    <View style={styles.scoreEntry}>
                      <Input
                        style={styles.scoreInput}
                        keyboardType="number-pad"
                        value={draft.team1}
                        onChangeText={(v) => setDrafts((prev) => ({ ...prev, [match.id]: { ...draft, team1: v.replace(/[^0-9]/g, '') } }))}
                        accessibilityLabel="Team 1 score"
                      />
                      <Text style={styles.muted}>–</Text>
                      <Input
                        style={styles.scoreInput}
                        keyboardType="number-pad"
                        value={draft.team2}
                        onChangeText={(v) => setDrafts((prev) => ({ ...prev, [match.id]: { ...draft, team2: v.replace(/[^0-9]/g, '') } }))}
                        accessibilityLabel="Team 2 score"
                      />
                      <TouchableOpacity style={styles.saveButton} onPress={() => void submitScore(match.id)} disabled={busy} accessibilityRole="button" accessibilityLabel="Save score">
                        <Text style={styles.saveButtonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.tag}>Pending</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      {showNextRound ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => void nextRound()} disabled={busy} accessibilityRole="button" accessibilityLabel="Generate next round">
          <Ionicons name="refresh" size={16} color={Colors.textInverse} />
          <Text style={styles.primaryButtonText}>{busy ? 'Working…' : 'Generate Next Round'}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl * 2 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  title: { flex: 1, fontSize: FontSize.lg, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  badge: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  badgeDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  badgeDoneText: { color: Colors.textInverse },
  card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowText: { fontSize: FontSize.sm, color: Colors.text, flexShrink: 1 },
  muted: { fontSize: FontSize.xs, color: Colors.textMuted },
  tag: { fontSize: FontSize.xs, color: Colors.textSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  points: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  match: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: BorderRadius.sm, padding: Spacing.sm, gap: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  teams: { flex: 1, minWidth: 0 },
  vs: { fontSize: FontSize.xs, color: Colors.textMuted, marginVertical: 2 },
  score: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  scoreEntry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreInput: { width: 48, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, paddingHorizontal: 6, paddingVertical: 6, fontSize: FontSize.sm, color: Colors.text, backgroundColor: Colors.surface, textAlign: 'center' },
  saveButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  saveButtonText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.xs },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md },
  primaryButtonText: { color: Colors.textInverse, fontFamily: FontFamily.bold, fontWeight: '700', fontSize: FontSize.sm },
  dangerButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  dangerButtonText: { color: Colors.error, fontWeight: '600', fontSize: FontSize.sm },
});
