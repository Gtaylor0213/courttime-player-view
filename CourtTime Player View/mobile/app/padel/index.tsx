/**
 * Padel — Social Play sessions (Americano / Mexicano).
 *
 * Mirrors web's `Padel.tsx` + `padel/PadelSessionList.tsx`: any member can
 * create a session, join (paying the drop-in fee when the club charges one),
 * the host starts it once full, and joined players open the session to see
 * rounds and standings. Facility admins set the drop-in rate here too.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { formatTimeLabel } from '../../../shared/utils/scheduleOverview';
import { padelDropInCheckoutUrls } from '../../../shared/utils/mobileCheckoutUrls';
import { showAlert } from '../../src/utils/alert';
import { hapticSuccess, hapticError } from '../../src/utils/haptics';
import { formatCentsAsUsd, openStripeCheckout } from '../../src/utils/payments';
import { useAuth } from '../../src/contexts/AuthContext';
import { EmptyState } from '../../src/components/EmptyState';
import { Input } from '../../src/components/Input';
import { MiniCalendar } from '../../src/components/MiniCalendar';
import { OpenSpotsList } from '../../src/components/OpenSpotsList';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';

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
  createdBy?: string;
  hostName?: string | null;
  joinedCount: number;
  isJoined: boolean;
}

function formatSessionDate(ymd: string): string {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatLabel(format: string): string {
  if (format === 'americano') return 'Americano';
  if (format === 'mexicano') return 'Mexicano';
  return format;
}

const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 6 AM – 10 PM
const MINUTES = ['00', '15', '30', '45'];

export default function PadelScreen() {
  const { facilityId, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ padelPaymentSuccess?: string; padelPaymentCancelled?: string }>();
  const isFacilityAdmin = !!facilityId && (user?.adminFacilities ?? []).includes(facilityId);

  const [sessions, setSessions] = useState<PadelSession[]>([]);
  const [dropInRateCents, setDropInRateCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Admin pricing editor
  const [showPricing, setShowPricing] = useState(false);
  const [pricingInput, setPricingInput] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);

  // Create session
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const [sessionsRes, pricingRes] = await Promise.all([
      padelEndpoints.sessions(facilityId),
      padelEndpoints.pricing(facilityId),
    ]);
    if (sessionsRes.success) {
      const list = (sessionsRes.data as { sessions?: unknown })?.sessions;
      setSessions(Array.isArray(list) ? (list as PadelSession[]) : []);
    }
    if (pricingRes.success) {
      const cents = (pricingRes.data as { dropInRateCents?: number | null })?.dropInRateCents;
      setDropInRateCents(typeof cents === 'number' ? cents : null);
      setPricingInput(typeof cents === 'number' ? (cents / 100).toFixed(2) : '');
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from Stripe after a drop-in payment (padelDropInCheckoutUrls). The
  // webhook is authoritative; this just reloads and tells the player.
  useEffect(() => {
    if (params.padelPaymentSuccess === '1') {
      router.setParams({ padelPaymentSuccess: undefined, session_id: undefined } as never);
      showAlert('Payment received', "You're in!");
      void load();
    } else if (params.padelPaymentCancelled === '1') {
      router.setParams({ padelPaymentCancelled: undefined } as never);
      showAlert('Payment not completed', 'Your spot was not held.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.padelPaymentSuccess, params.padelPaymentCancelled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleJoinOrLeave(session: PadelSession) {
    if (busyId) return;
    if (!session.isJoined && session.joinedCount >= session.playerCount) return;
    setBusyId(session.id);
    const res = session.isJoined
      ? await padelEndpoints.leave(session.id)
      : await padelEndpoints.join(session.id, padelDropInCheckoutUrls());
    setBusyId(null);
    if (!res.success) {
      hapticError();
      showAlert(session.isJoined ? 'Could not leave' : 'Could not join', res.error || 'Please try again.');
      return;
    }
    const data = res.data as { requiresPayment?: boolean; checkoutUrl?: string } | undefined;
    if (data?.requiresPayment && data.checkoutUrl) {
      const opened = await openStripeCheckout(data.checkoutUrl);
      if (!opened) showAlert('Payment', 'Could not open Stripe checkout. Try again.');
      return;
    }
    hapticSuccess();
    await load();
  }

  async function handleStart(session: PadelSession) {
    setBusyId(session.id);
    const res = await padelEndpoints.start(session.id);
    setBusyId(null);
    if (res.success) {
      hapticSuccess();
      await load();
      router.push(`/padel/${session.id}` as never);
    } else {
      hapticError();
      showAlert('Could not start session', res.error || 'Please try again.');
    }
  }

  async function handleSavePricing() {
    if (!facilityId) return;
    const trimmed = pricingInput.trim();
    const cents = trimmed === '' ? null : Math.round(Number(trimmed) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
      showAlert('Pricing', 'Enter a valid dollar amount, or leave blank for free/members-only.');
      return;
    }
    setSavingPricing(true);
    const res = await padelEndpoints.setPricing(facilityId, cents);
    setSavingPricing(false);
    if (res.success) {
      setDropInRateCents(cents);
      setShowPricing(false);
      showAlert('Pricing', cents ? `Drop-in rate set to ${formatCentsAsUsd(cents)}/player` : 'Padel is now free/members-only');
    } else {
      showAlert('Pricing', res.error || 'Could not update pricing.');
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Padel' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Padel' }} />

      {/* Header: rate, pricing (admin), new session */}
      <View style={styles.headerRow}>
        {dropInRateCents != null ? (
          <View style={styles.rateBadge}>
            <Text style={styles.rateText}>{formatCentsAsUsd(dropInRateCents)}/player drop-in</Text>
          </View>
        ) : (
          <Text style={styles.rateFree}>Free / members-only</Text>
        )}
        <View style={styles.headerActions}>
          {isFacilityAdmin ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowPricing((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Padel pricing"
            >
              <Ionicons name="settings-outline" size={16} color={Colors.text} />
              <Text style={styles.secondaryButtonText}>Pricing</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setShowCreate(true)}
            accessibilityRole="button"
            accessibilityLabel="New Social Play session"
          >
            <Ionicons name="add" size={16} color={Colors.textInverse} />
            <Text style={styles.primaryButtonText}>New Social Play</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isFacilityAdmin && showPricing ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Padel drop-in rate</Text>
          <Text style={styles.metaText}>
            Per-player fee to join a Social Play session. Leave blank to keep padel free and members-only. Set a price
            to open drop-in to any registered member, who pays when they join.
          </Text>
          <View style={styles.pricingRow}>
            <Text style={styles.metaText}>$</Text>
            <Input
              style={styles.pricingInput}
              value={pricingInput}
              onChangeText={(v) => setPricingInput(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="Free / members-only"
              accessibilityLabel="Drop-in rate in dollars"
            />
            <Text style={styles.metaText}>/ player</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void handleSavePricing()}
              disabled={savingPricing}
              accessibilityRole="button"
              accessibilityLabel="Save pricing"
            >
              <Text style={styles.primaryButtonText}>{savingPricing ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Open spots on members' bookings (web: "Open Matches") */}
      <OpenSpotsList facilityId={facilityId ?? null} refreshKey={refreshing ? 1 : 0} title="Open Matches" />

      <Text style={styles.sectionTitle}>Social Play Sessions</Text>
      {sessions.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No open sessions"
          description="Create a Social Play session and share it with other members to fill the roster."
          actionLabel="New Social Play"
          onAction={() => setShowCreate(true)}
        />
      ) : null}

      {sessions.map((session) => {
        const isFull = session.joinedCount >= session.playerCount;
        const isHost = !!user && session.createdBy === user.id;
        const inProgress = session.status !== 'open' && session.status !== 'full';
        const busy = busyId === session.id;

        return (
          <View key={session.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.format}>{formatLabel(session.format)}</Text>
              <Text style={styles.spots}>
                {session.joinedCount}/{session.playerCount} players
                {session.status === 'full' ? ' · Full' : inProgress ? ` · ${session.status.replace('_', ' ')}` : ''}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
              <Text style={styles.metaText}>
                {formatSessionDate(session.sessionDate)} · {formatTimeLabel(session.startTime)} · {session.durationMinutes} min
              </Text>
            </View>
            {session.hostName ? (
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color={Colors.primary} />
                <Text style={styles.metaText}>Hosted by {isHost ? 'you' : session.hostName}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Ionicons name="repeat-outline" size={14} color={Colors.primary} />
              <Text style={styles.metaText}>{session.roundsCount} rounds</Text>
            </View>

            <View style={styles.actions}>
              {isHost && isFull && !inProgress ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => void handleStart(session)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Start session"
                >
                  <Text style={styles.primaryButtonText}>{busy ? '…' : 'Start'}</Text>
                </TouchableOpacity>
              ) : null}
              {!isHost && !session.isJoined && !isFull && !inProgress ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => void handleJoinOrLeave(session)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Join this session"
                >
                  <Text style={styles.primaryButtonText}>
                    {busy ? '…' : dropInRateCents ? `Join — ${formatCentsAsUsd(dropInRateCents)}` : 'Join'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {!isHost && session.isJoined && !inProgress ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => void handleJoinOrLeave(session)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Leave this session"
                >
                  <Text style={styles.secondaryButtonText}>{busy ? '…' : 'Leave'}</Text>
                </TouchableOpacity>
              ) : null}
              {!isHost && !session.isJoined && isFull && !inProgress ? (
                <View style={[styles.secondaryButton, styles.disabled]} accessible accessibilityRole="button" accessibilityLabel="Session full" accessibilityState={{ disabled: true }}>
                  <Text style={styles.secondaryButtonText}>Full</Text>
                </View>
              ) : null}
              {session.isJoined || isHost || inProgress ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push(`/padel/${session.id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel="View session"
                >
                  <Text style={styles.secondaryButtonText}>View</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.text} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      <CreateSessionModal
        visible={showCreate}
        facilityId={facilityId ?? null}
        dropInRateCents={dropInRateCents}
        onClose={() => setShowCreate(false)}
        onCreated={load}
      />
    </ScrollView>
  );
}

/** Web's CreateSocialPlaySession dialog. */
function CreateSessionModal({
  visible,
  facilityId,
  dropInRateCents,
  onClose,
  onCreated,
}: {
  visible: boolean;
  facilityId: string | null;
  dropInRateCents: number | null;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [format, setFormat] = useState<'americano' | 'mexicano'>('americano');
  const [sessionDate, setSessionDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [hour, setHour] = useState('18');
  const [minute, setMinute] = useState('00');
  const [durationMinutes, setDurationMinutes] = useState('90');
  const [playerCount, setPlayerCount] = useState('4');
  const [roundsCount, setRoundsCount] = useState('5');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFormat('americano');
    setSessionDate('');
    setShowCalendar(false);
    setHour('18');
    setMinute('00');
    setDurationMinutes('90');
    setPlayerCount('4');
    setRoundsCount('5');
  }, [visible]);

  async function submit() {
    if (!facilityId) return;
    if (!sessionDate) {
      showAlert('Social Play', 'Pick a date and start time.');
      return;
    }
    const players = Number(playerCount);
    if (!players || players % 4 !== 0) {
      showAlert('Social Play', 'Player count must be a multiple of 4.');
      return;
    }
    setSubmitting(true);
    const res = await padelEndpoints.create({
      facilityId,
      format,
      sessionDate,
      startTime: `${hour}:${minute}`,
      durationMinutes: Number(durationMinutes) || 90,
      playerCount: players,
      roundsCount: Number(roundsCount) || 5,
      ...padelDropInCheckoutUrls(),
    });
    setSubmitting(false);
    if (!res.success) {
      hapticError();
      showAlert('Could not create session', res.error || 'Please try again.');
      return;
    }
    const data = res.data as { requiresPayment?: boolean; checkoutUrl?: string } | undefined;
    onClose();
    await onCreated();
    if (data?.requiresPayment && data.checkoutUrl) {
      const opened = await openStripeCheckout(data.checkoutUrl);
      if (!opened) showAlert('Payment', 'Could not open Stripe checkout. Try again.');
      return;
    }
    hapticSuccess();
    showAlert('Social Play', 'Session created — share it with other members to fill the roster.');
  }

  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>New Social Play</Text>
          <TouchableOpacity onPress={() => void submit()} disabled={submitting} accessibilityRole="button" accessibilityLabel="Create session">
            <Text style={[styles.modalSave, submitting && { opacity: 0.5 }]}>{submitting ? '…' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {dropInRateCents ? (
            <Text style={styles.metaText}>
              This club charges {formatCentsAsUsd(dropInRateCents)} per player. You pay your share when you create the session.
            </Text>
          ) : null}
          <Text style={styles.label}>Format</Text>
          <View style={styles.chipRow}>
            {(['americano', 'mexicano'] as const).map((f) => (
              <Chip key={f} label={formatLabel(f)} selected={format === f} onPress={() => setFormat(f)} />
            ))}
          </View>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.pickerRow} onPress={() => setShowCalendar((v) => !v)} accessibilityRole="button" accessibilityLabel="Session date">
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
            <Text style={[styles.pickerText, !sessionDate && styles.placeholder]}>{sessionDate ? formatSessionDate(sessionDate) : 'Select a date'}</Text>
            <Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
          </TouchableOpacity>
          {showCalendar ? (
            <MiniCalendar selectedDate={sessionDate || todayYmd} minDate={todayYmd} onSelectDate={(d) => { setSessionDate(d); setShowCalendar(false); }} />
          ) : null}
          <Text style={styles.label}>Start time</Text>
          <View style={styles.chipRow}>
            {HOURS.map((h) => (
              <Chip key={h} label={`${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`} selected={hour === String(h).padStart(2, '0')} onPress={() => setHour(String(h).padStart(2, '0'))} />
            ))}
          </View>
          <View style={styles.chipRow}>
            {MINUTES.map((m) => (
              <Chip key={m} label={`:${m}`} selected={minute === m} onPress={() => setMinute(m)} />
            ))}
          </View>
          <Text style={styles.label}>Duration (minutes)</Text>
          <Input style={styles.input} value={durationMinutes} onChangeText={(v) => setDurationMinutes(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Duration in minutes" />
          <Text style={styles.label}>Players (multiple of 4)</Text>
          <View style={styles.chipRow}>
            {['4', '8', '12', '16'].map((n) => (
              <Chip key={n} label={n} selected={playerCount === n} onPress={() => setPlayerCount(n)} />
            ))}
          </View>
          <Text style={styles.label}>Rounds</Text>
          <Input style={styles.input} value={roundsCount} onChangeText={(v) => setRoundsCount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Number of rounds" />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, marginLeft: 'auto' },
  rateBadge: { backgroundColor: Colors.surface, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  rateText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  rateFree: { fontSize: FontSize.xs, color: Colors.textMuted },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: Spacing.sm },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  format: { fontSize: FontSize.md, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  spots: { fontSize: FontSize.xs, color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary, flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: { color: Colors.textInverse, fontFamily: FontFamily.bold, fontWeight: '700', fontSize: FontSize.sm },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  secondaryButtonText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  disabled: { opacity: 0.5 },
  pricingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs, flexWrap: 'wrap' },
  pricingInput: {
    width: 120,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  modalBody: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  chipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  pickerText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  placeholder: { color: Colors.textMuted, fontWeight: '400' },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
});
