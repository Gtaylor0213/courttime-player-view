/**
 * Padel social play.
 *
 * Mirrors the player-facing half of web's `Padel.tsx`: the open Americano and
 * Mexicano sessions at this club, joining and leaving them, and the standings
 * once a session is under way.
 *
 * Creating and running a session (starting rounds, entering scores) stays on
 * web, where the organiser is already working — the same split as facility
 * admin screens. `docs/mobile-web-sync.md` records that.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { padelEndpoints } from '../src/api/endpoints';
import { formatTimeLabel } from '../../shared/utils/scheduleOverview';
import { showAlert } from '../src/utils/alert';
import { hapticSuccess, hapticError } from '../src/utils/haptics';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Padel');

interface PadelSession {
  id: string;
  format: 'americano' | 'mexicano' | string;
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  playerCount: number;
  roundsCount: number;
  status: string;
  hostName?: string | null;
  joinedCount: number;
  isJoined: boolean;
}

interface Standing {
  userId: string;
  fullName: string;
  points?: number;
  gamesWon?: number;
  rank?: number;
}

function formatSessionDate(ymd: string): string {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatLabel(format: string): string {
  if (format === 'americano') return 'Americano';
  if (format === 'mexicano') return 'Mexicano';
  return format;
}

export default function PadelScreen() {
  const { facilityId } = useAuth();
  const [sessions, setSessions] = useState<PadelSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [standings, setStandings] = useState<Record<string, Standing[]>>({});

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const res = await padelEndpoints.sessions(facilityId);
    if (res.success) {
      // This route returns { success, sessions } rather than a data envelope.
      const list = (res.data as { sessions?: unknown })?.sessions;
      setSessions(Array.isArray(list) ? (list as PadelSession[]) : []);
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function toggleJoin(session: PadelSession) {
    if (busyId) return;
    // Guard here as well as on the button: `disabled` only stops touches, so
    // any other caller — an accessibility action, a later refactor — could
    // otherwise send a join the server will refuse.
    if (!session.isJoined && session.joinedCount >= session.playerCount) return;
    setBusyId(session.id);
    const res = session.isJoined
      ? await padelEndpoints.leave(session.id)
      : await padelEndpoints.join(session.id);
    setBusyId(null);

    if (!res.success) {
      hapticError();
      showAlert(
        session.isJoined ? 'Could not leave' : 'Could not join',
        res.error || 'Please try again.'
      );
      return;
    }
    hapticSuccess();
    await load();
  }

  async function showStandings(session: PadelSession) {
    if (standings[session.id]) {
      setStandings((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      return;
    }
    const res = await padelEndpoints.standings(session.id);
    if (!res.success) {
      showAlert('Standings', res.error || 'Could not load standings.');
      return;
    }
    const payload = res.data as { standings?: unknown; data?: { standings?: unknown } };
    const list = payload?.standings ?? payload?.data?.standings;
    setStandings((prev) => ({
      ...prev,
      [session.id]: Array.isArray(list) ? (list as Standing[]) : [],
    }));
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Padel' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Padel' }} />
        <EmptyState
          icon="trophy-outline"
          title="No open sessions"
          description="When your club opens an Americano or Mexicano session, it will appear here."
        />
      </>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Padel' }} />

      {sessions.map((session) => {
        const isFull = session.joinedCount >= session.playerCount;
        const rows = standings[session.id];
        const inProgress = session.status !== 'open' && session.status !== 'full';

        return (
          <View key={session.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.format}>{formatLabel(session.format)}</Text>
              <Text style={styles.spots}>
                {session.joinedCount}/{session.playerCount} players
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
              <Text style={styles.metaText}>
                {formatSessionDate(session.sessionDate)} · {formatTimeLabel(session.startTime)} ·{' '}
                {session.durationMinutes} min
              </Text>
            </View>

            {session.hostName ? (
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color={Colors.primary} />
                <Text style={styles.metaText}>Hosted by {session.hostName}</Text>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              <Ionicons name="repeat-outline" size={14} color={Colors.primary} />
              <Text style={styles.metaText}>{session.roundsCount} rounds</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  session.isJoined && styles.leaveButton,
                  !session.isJoined && isFull && styles.disabledButton,
                ]}
                onPress={() => toggleJoin(session)}
                disabled={busyId === session.id || (!session.isJoined && isFull)}
                accessibilityRole="button"
                accessibilityLabel={
                  session.isJoined ? 'Leave this session' : isFull ? 'Session full' : 'Join this session'
                }
              >
                <Text style={[styles.joinText, session.isJoined && styles.leaveText]}>
                  {busyId === session.id
                    ? '…'
                    : session.isJoined
                      ? 'Leave'
                      : isFull
                        ? 'Full'
                        : 'Join'}
                </Text>
              </TouchableOpacity>

              {inProgress ? (
                <TouchableOpacity
                  style={styles.standingsButton}
                  onPress={() => showStandings(session)}
                  accessibilityRole="button"
                  accessibilityLabel={rows ? 'Hide standings' : 'Show standings'}
                >
                  <Text style={styles.standingsButtonText}>
                    {rows ? 'Hide standings' : 'Standings'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {rows ? (
              rows.length === 0 ? (
                <Text style={styles.noStandings}>No scores recorded yet.</Text>
              ) : (
                <View style={styles.standings}>
                  {rows.map((row, idx) => (
                    <View key={row.userId || idx} style={styles.standingRow}>
                      <Text style={styles.standingRank}>{row.rank ?? idx + 1}</Text>
                      <Text style={styles.standingName}>{row.fullName}</Text>
                      <Text style={styles.standingPoints}>{row.points ?? row.gamesWon ?? 0}</Text>
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </View>
        );
      })}

      <Text style={styles.footerHint}>
        Creating and scoring sessions is done on the CourtTime website.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  format: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  spots: { fontSize: FontSize.xs, color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  joinButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  leaveButton: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  disabledButton: { opacity: 0.5 },
  joinText: {
    color: Colors.textInverse,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  leaveText: { color: Colors.text },
  standingsButton: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  standingsButtonText: { fontSize: FontSize.sm, color: Colors.primary },
  standings: { marginTop: Spacing.sm, gap: 4 },
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  standingRank: {
    width: 22,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  standingName: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  standingPoints: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.primary,
  },
  noStandings: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  footerHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
