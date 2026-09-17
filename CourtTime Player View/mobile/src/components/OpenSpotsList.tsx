/**
 * OpenSpotsList
 * Bookings at the club currently advertising an open spot, with "Claim Spot" —
 * web shows this as "Open Matches" on the Padel page; mobile shows it on Home
 * and Padel. Renders nothing when there are no open spots.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reservationEndpoints } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { showApiErrorAlert } from '../utils/alert';
import { hapticError, hapticSuccess } from '../utils/haptics';
import { formatTimeLabel } from '../../../shared/utils/scheduleOverview';
import { Button } from './Button';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';

export interface OpenSpotBooking {
  id: string;
  courtId: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number | null;
  bookingType?: string | null;
  hostUserId: string;
  hostName: string;
  claimedCount: number | string;
}

interface Props {
  facilityId: string | null;
  /** Bumps to refetch (e.g. after the parent's pull-to-refresh). */
  refreshKey?: number;
  /** Called after a successful claim so the parent can reload its bookings. */
  onClaimed?: () => void;
  /** Section heading; pass null to render cards only. */
  title?: string | null;
}

function formatDate(ymd: string): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function OpenSpotsList({ facilityId, refreshKey = 0, onClaimed, title = 'Open spots' }: Props) {
  const { user } = useAuth();
  const [spots, setSpots] = useState<OpenSpotBooking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) {
      setSpots([]);
      return;
    }
    const res = await reservationEndpoints.openSpots(facilityId);
    const list = res.success ? ((res.data as any)?.bookings ?? (res.data as any)?.data?.bookings) : null;
    setSpots(Array.isArray(list) ? list : []);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const claim = async (spot: OpenSpotBooking) => {
    setBusyId(spot.id);
    const res = await reservationEndpoints.claimSpot(spot.id);
    setBusyId(null);
    if (res.success) {
      hapticSuccess();
      await load();
      onClaimed?.();
    } else {
      hapticError();
      showApiErrorAlert(res, 'Could not claim spot');
    }
  };

  if (spots.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="people" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
      ) : null}
      {spots.map((spot) => {
        const isHost = spot.hostUserId === user?.id;
        const claimed = Number(spot.claimedCount) || 0;
        const full = !!spot.maxPlayers && claimed >= spot.maxPlayers;
        return (
          <View key={spot.id} style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.court}>{spot.courtName}</Text>
              <Text style={styles.meta}>
                {formatDate(spot.bookingDate)} · {formatTimeLabel(spot.startTime)}–{formatTimeLabel(spot.endTime)}
              </Text>
              <Text style={styles.meta}>
                {claimed}/{spot.maxPlayers ?? '?'} players · Hosted by {isHost ? 'you' : spot.hostName}
              </Text>
            </View>
            {isHost ? (
              <Text style={styles.hostTag}>Your booking</Text>
            ) : (
              <Button
                title={full ? 'Full' : 'Claim Spot'}
                onPress={() => void claim(spot)}
                disabled={full || busyId !== null}
                loading={busyId === spot.id}
                accessibilityLabel={`Claim a spot on ${spot.courtName} ${formatDate(spot.bookingDate)}`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  court: { fontSize: FontSize.md, fontFamily: FontFamily.bold, fontWeight: '600', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  hostTag: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
});
