/**
 * ReservationSheet
 * Member-facing reservation details, mirroring web's ReservationManagementModal:
 *   - who booked, when, type, notes
 *   - split payment: shares, "Pay my share" / "Decline", organiser edits the roster
 *   - open spots: owner posts / withdraws a spot for other members
 *   - post-play: settlement status and the players on the reservation (add/remove
 *     while unsettled), behind `post_play_settlement` like web
 *   - Add to Calendar / Edit / Cancel
 *
 * Opens instantly from whatever the caller has (a grid cell or a Home card),
 * then fetches the full record and the sections that apply.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { reservationEndpoints } from '../api/endpoints';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { FEATURE_FLAGS } from '../../../shared/constants/featureFlags';
import { getBookingTypeLabel } from '../../../shared/constants/bookingTypes';
import { splitPaymentCheckoutUrls } from '../../../shared/utils/mobileCheckoutUrls';
import { unwrapApiPayload } from '../../../shared/api/core';
import { showAlert, showApiErrorAlert } from '../utils/alert';
import { hapticError, hapticSuccess } from '../utils/haptics';
import { formatCentsAsUsd, openStripeCheckout } from '../utils/payments';
import { addBookingToCalendarWithFeedback, bookingWithDetailsToCalendarDetails } from '../utils/bookingCalendar';
import { Button } from './Button';
import { Input } from './Input';
import { SplitPaymentPicker, type SplitPaymentMember } from './SplitPaymentPicker';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import type { BookingWithDetails } from '../types/database';

type SettlementStatus = 'unsettled' | 'settling' | 'settled' | 'cancelled_unpaid' | undefined;

interface Participant {
  userId: string;
  fullName: string;
  hasSavedCard?: boolean;
  cardLast4?: string | null;
}

interface SplitShare {
  userId: string;
  fullName: string;
  amountCents: number | string;
  status: 'pending' | 'paid' | 'declined' | string;
}

interface SplitPaymentSummary {
  bookingId: string;
  ownerId: string;
  status: string;
  paymentDeadlineAt?: string | null;
  shares: SplitShare[];
}

/** The full record from GET /api/bookings/:id, beyond what BookingWithDetails carries. */
interface ReservationDetail extends BookingWithDetails {
  settlementStatus?: SettlementStatus;
  openToMembers?: boolean;
  maxPlayers?: number | null;
}

interface Props {
  booking: BookingWithDetails | null;
  visible: boolean;
  onClose: () => void;
  /** Called after any change (cancel, roster, open spot, split) so the caller can reload. */
  onChanged?: () => void;
  /** Opens the caller's edit flow for this booking (Book tab: slot picker; Home: EditBookingModal). */
  onEdit?: (booking: BookingWithDetails) => void;
}

function formatTimeLabel(time: string): string {
  const [hStr, mStr = '00'] = String(time).split(':');
  const h = parseInt(hStr ?? '0', 10);
  if (!Number.isFinite(h)) return time;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr.slice(0, 2)} ${ampm}`;
}

function formatLongDate(value: unknown): string {
  const ymd = String(value ?? '').slice(0, 10);
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const SETTLEMENT_LABELS: Record<string, string> = {
  unsettled: 'Pay after play',
  settling: 'Partial settlement',
  settled: 'Settled',
  cancelled_unpaid: 'Cancelled (unpaid)',
};

export function ReservationSheet({ booking, visible, onClose, onChanged, onEdit }: Props) {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const postPlayEnabled = isFeatureEnabled(FEATURE_FLAGS.POST_PLAY_SETTLEMENT);

  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [split, setSplit] = useState<SplitPaymentSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [searching, setSearching] = useState(false);

  const [editingRoster, setEditingRoster] = useState(false);
  const [rosterMembers, setRosterMembers] = useState<SplitPaymentMember[]>([]);

  const bookingId = booking?.id ?? '';
  const isOwner = !!user && !!detail && detail.userId === user.id;
  const isFacilityAdmin = !!user && !!detail && (user.adminFacilities ?? []).includes(detail.facilityId);
  const settlementStatus = detail?.settlementStatus;
  const isPostPlayBooking =
    settlementStatus === 'unsettled' || settlementStatus === 'settling' || settlementStatus === 'settled';
  const canEditRoster = isPostPlayBooking && settlementStatus === 'unsettled' && (isOwner || isFacilityAdmin);
  const showRosterSection = postPlayEnabled || isPostPlayBooking;

  const load = useCallback(async () => {
    if (!booking) return;
    const base: ReservationDetail = { ...booking };
    setDetail(base);
    setParticipants([]);
    setSplit(null);
    setEditingRoster(false);
    setMemberSearch('');
    setMemberResults([]);

    // Placeholder ids (grid cells without a booking id) have nothing more to fetch.
    if (!booking.id || booking.id.includes('_')) return;

    const [detailRes, participantsRes, splitRes] = await Promise.all([
      reservationEndpoints.detail(booking.id),
      reservationEndpoints.participants(booking.id),
      reservationEndpoints.splitPayment(booking.id),
    ]);

    const full = detailRes.success
      ? ((detailRes.data as any)?.booking ?? (detailRes.data as any)?.data?.booking)
      : null;
    if (full) {
      setDetail({
        ...base,
        userId: full.userId || base.userId,
        facilityId: full.facilityId || base.facilityId,
        bookingDate: full.bookingDate ? String(full.bookingDate).slice(0, 10) : base.bookingDate,
        startTime: full.startTime || base.startTime,
        endTime: full.endTime || base.endTime,
        durationMinutes: full.durationMinutes || base.durationMinutes,
        status: full.status || base.status,
        bookingType: full.bookingType ?? base.bookingType,
        notes: full.notes ?? base.notes,
        courtName: full.courtName || base.courtName,
        userName: full.userName || base.userName,
        userEmail: full.userEmail || base.userEmail,
        settlementStatus: full.settlementStatus,
        openToMembers: !!full.openToMembers,
        maxPlayers: full.maxPlayers ?? null,
      });
    }

    if (participantsRes.success) {
      const list = (participantsRes.data as any)?.participants ?? (participantsRes.data as any)?.data?.participants;
      setParticipants(Array.isArray(list) ? list : []);
    }

    // 400 simply means this booking is not split; keep the section hidden.
    if (splitRes.success) {
      const summary = unwrapApiPayload<SplitPaymentSummary>(splitRes.data);
      setSplit(summary && Array.isArray(summary.shares) && summary.shares.length > 0 ? summary : null);
    }
  }, [booking]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Member search for the roster (same endpoint the split picker uses).
  useEffect(() => {
    if (!canEditRoster || !detail?.facilityId) return;
    const q = memberSearch.trim();
    if (q.length < 2) {
      setMemberResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await api.get(
        `/api/bookings/facility/${detail.facilityId}/members?q=${encodeURIComponent(q)}`
      );
      if (cancelled) return;
      const list = (res.data as any)?.members ?? (res.data as any)?.data?.members ?? [];
      const taken = new Set(participants.map((p) => p.userId));
      setMemberResults(
        (Array.isArray(list) ? list : []).filter((m: any) => !taken.has(m.userId)).slice(0, 8)
      );
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [memberSearch, canEditRoster, detail?.facilityId, participants]);

  const refreshAndNotify = async () => {
    await load();
    onChanged?.();
  };

  // ── Actions ──

  const handleToggleOpenSpot = async () => {
    if (!detail) return;
    const nextOpen = !detail.openToMembers;
    setBusy('openSpot');
    const res = await reservationEndpoints.setOpenToMembers(detail.id, nextOpen, detail.maxPlayers ?? undefined);
    setBusy(null);
    if (res.success) {
      hapticSuccess();
      setDetail((prev) => (prev ? { ...prev, openToMembers: nextOpen } : prev));
      onChanged?.();
    } else {
      hapticError();
      showApiErrorAlert(res, 'Could not update');
    }
  };

  const handlePayShare = async () => {
    if (!detail) return;
    setBusy('pay');
    const { successUrl, cancelUrl } = splitPaymentCheckoutUrls();
    const res = await reservationEndpoints.splitPaymentCheckout(detail.id, successUrl, cancelUrl);
    setBusy(null);
    const url = (res.data as any)?.checkoutUrl ?? (res.data as any)?.data?.checkoutUrl;
    if (!res.success || !url) {
      hapticError();
      showApiErrorAlert(res, 'Could not start payment');
      return;
    }
    const opened = await openStripeCheckout(url);
    if (!opened) showAlert('Payment', 'Could not open Stripe checkout. Please try again.');
  };

  const handleDeclineShare = () => {
    if (!detail) return;
    Alert.alert(
      'Decline your share?',
      'Declining will cancel this reservation for everyone and refund anyone who already paid.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy('decline');
              const res = await reservationEndpoints.declineSplitPayment(detail.id);
              setBusy(null);
              if (res.success) {
                hapticSuccess();
                onChanged?.();
                onClose();
              } else {
                hapticError();
                showApiErrorAlert(res, 'Could not decline');
              }
            })();
          },
        },
      ]
    );
  };

  const handleSaveRoster = async () => {
    if (!detail) return;
    setBusy('roster');
    const res = await reservationEndpoints.updateSplitParticipants(
      detail.id,
      rosterMembers.map((m) => m.userId)
    );
    setBusy(null);
    if (res.success) {
      hapticSuccess();
      setEditingRoster(false);
      await refreshAndNotify();
    } else {
      hapticError();
      showApiErrorAlert(res, 'Could not update who is splitting this reservation');
    }
  };

  const handleAddParticipant = async (userId: string) => {
    if (!detail) return;
    setBusy(`add-${userId}`);
    const res = await reservationEndpoints.addParticipant(detail.id, userId);
    setBusy(null);
    if (res.success) {
      const list = (res.data as any)?.participants ?? (res.data as any)?.data?.participants;
      if (Array.isArray(list)) setParticipants(list);
      setMemberSearch('');
      setMemberResults([]);
      onChanged?.();
    } else {
      showApiErrorAlert(res, 'Failed to add player');
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!detail) return;
    setBusy(`remove-${userId}`);
    const res = await reservationEndpoints.removeParticipant(detail.id, userId);
    setBusy(null);
    if (res.success) {
      const list = (res.data as any)?.participants ?? (res.data as any)?.data?.participants;
      if (Array.isArray(list)) setParticipants(list);
      onChanged?.();
    } else {
      showApiErrorAlert(res, 'Failed to remove player');
    }
  };

  const handleCancelBooking = () => {
    if (!detail || !user) return;
    Alert.alert('Cancel booking', 'Cancel this reservation?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy('cancel');
            const res = await api.delete(`/api/bookings/${detail.id}?userId=${user.id}`);
            setBusy(null);
            if (res.success) {
              hapticSuccess();
              onChanged?.();
              onClose();
              showAlert('Cancelled', 'Booking was cancelled successfully.');
            } else {
              hapticError();
              showApiErrorAlert(res, 'Could not cancel');
            }
          })();
        },
      },
    ]);
  };

  if (!booking) return null;
  const d = detail ?? (booking as ReservationDetail);
  const canManage = !!user && (d.userId === user.id || isFacilityAdmin);
  const mine = split?.shares.find((s) => s.userId === user?.id);
  const paidCount = split?.shares.filter((s) => s.status === 'paid').length ?? 0;
  const isSplitOrganizer = !!split && split.ownerId === user?.id;
  const splitStillOpen = split?.status === 'pending';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Reservation Details</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Summary */}
            <Text style={styles.courtName}>{d.courtName}</Text>
            <Text style={styles.line}>{formatLongDate(d.bookingDate)}</Text>
            <Text style={styles.line}>
              {formatTimeLabel(d.startTime)} – {formatTimeLabel(d.endTime)}
            </Text>
            <Text style={styles.line}>Reserved by: {d.userName || 'Member'}</Text>
            {d.bookingType ? <Text style={styles.line}>Type: {getBookingTypeLabel(d.bookingType)}</Text> : null}
            {d.notes ? <Text style={styles.line}>Notes: {d.notes}</Text> : null}
            {isPostPlayBooking ? (
              <View style={styles.badgeRow}>
                <Text style={styles.badgeLabel}>Payment</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{SETTLEMENT_LABELS[settlementStatus ?? ''] ?? settlementStatus}</Text>
                </View>
              </View>
            ) : null}

            {/* Split payment */}
            {split ? (
              <View style={styles.splitBox}>
                <Text style={styles.splitTitle}>
                  Split payment: {paidCount} of {split.shares.length} shares paid
                </Text>
                {split.shares.map((share) => (
                  <View key={share.userId} style={styles.shareRow}>
                    <Text style={styles.shareName}>{share.userId === user?.id ? 'You' : share.fullName}</Text>
                    <Text style={styles.shareStatus}>
                      {formatCentsAsUsd(Number(share.amountCents))} — {share.status}
                    </Text>
                  </View>
                ))}
                {mine?.status === 'pending' && split.paymentDeadlineAt ? (
                  <Text style={styles.splitHint}>
                    Pay by {new Date(split.paymentDeadlineAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} or
                    the court is released and everyone who paid is refunded.
                  </Text>
                ) : null}
                {mine?.status === 'pending' ? (
                  <View style={styles.actionRow}>
                    <Button
                      title="Pay my share"
                      onPress={() => void handlePayShare()}
                      loading={busy === 'pay'}
                      disabled={busy !== null}
                      style={styles.flex1}
                    />
                    <Button
                      title="Decline"
                      variant="destructive"
                      onPress={handleDeclineShare}
                      loading={busy === 'decline'}
                      disabled={busy !== null}
                      style={styles.flex1}
                    />
                  </View>
                ) : null}
                {isSplitOrganizer && splitStillOpen && !editingRoster ? (
                  <Button
                    title="Change who's splitting"
                    variant="secondary"
                    onPress={() => {
                      setRosterMembers(
                        split.shares
                          .filter((s) => s.userId !== user?.id)
                          .map((s) => ({ userId: s.userId, fullName: s.fullName }))
                      );
                      setEditingRoster(true);
                    }}
                    style={styles.mtSm}
                  />
                ) : null}
                {isSplitOrganizer && splitStillOpen && editingRoster ? (
                  <View style={styles.mtSm}>
                    <SplitPaymentPicker
                      facilityId={d.facilityId}
                      currentUserId={user?.id}
                      enabled
                      onEnabledChange={() => {}}
                      members={rosterMembers}
                      onMembersChange={setRosterMembers}
                      pickerOnly
                    />
                    <View style={styles.actionRow}>
                      <Button
                        title="Save"
                        onPress={() => void handleSaveRoster()}
                        loading={busy === 'roster'}
                        disabled={busy !== null}
                        style={styles.flex1}
                      />
                      <Button title="Cancel" variant="secondary" onPress={() => setEditingRoster(false)} style={styles.flex1} />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Open spots (owner, confirmed, booking declares a player count) */}
            {isOwner && d.status === 'confirmed' && !!d.maxPlayers ? (
              <View style={styles.infoBox}>
                <View style={styles.flex1}>
                  <Text style={styles.infoTitle}>Looking for more players?</Text>
                  <Text style={styles.infoText}>
                    {d.openToMembers
                      ? 'Other club members can see and claim an open spot on this booking.'
                      : 'Let other club members claim a spot on this booking.'}
                  </Text>
                </View>
                <Button
                  title={d.openToMembers ? 'Open' : 'Post Spot'}
                  variant={d.openToMembers ? 'primary' : 'secondary'}
                  onPress={() => void handleToggleOpenSpot()}
                  loading={busy === 'openSpot'}
                  disabled={busy !== null}
                  accessibilityLabel={d.openToMembers ? 'Stop advertising this spot' : 'Post an open spot'}
                />
              </View>
            ) : null}

            {/* Players on this reservation (post-play) */}
            {showRosterSection && isPostPlayBooking ? (
              <View style={styles.rosterBox}>
                <Text style={styles.rosterTitle}>Players on this reservation</Text>
                {participants.length === 0 ? (
                  <Text style={styles.infoText}>No players listed yet.</Text>
                ) : (
                  participants.map((p) => (
                    <View key={p.userId} style={styles.shareRow}>
                      <Text style={styles.shareName}>
                        {p.fullName}
                        {p.userId === d.userId ? '  · Owner' : ''}
                        {p.hasSavedCard && p.cardLast4 ? `  •••• ${p.cardLast4}` : ''}
                      </Text>
                      {canEditRoster && p.userId !== d.userId ? (
                        <TouchableOpacity
                          onPress={() => void handleRemoveParticipant(p.userId)}
                          disabled={busy !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${p.fullName}`}
                        >
                          {busy === `remove-${p.userId}` ? (
                            <ActivityIndicator size="small" color={Colors.error} />
                          ) : (
                            <Text style={styles.removeText}>Remove</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                )}
                {canEditRoster ? (
                  <View style={styles.mtSm}>
                    <Input
                      style={styles.input}
                      value={memberSearch}
                      onChangeText={setMemberSearch}
                      placeholder="Search members to add…"
                      accessibilityLabel="Search members to add"
                      autoCorrect={false}
                    />
                    {searching ? <Text style={styles.infoText}>Searching…</Text> : null}
                    {memberResults.map((m) => (
                      <TouchableOpacity
                        key={m.userId}
                        style={styles.resultRow}
                        onPress={() => void handleAddParticipant(m.userId)}
                        disabled={busy !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${m.fullName}`}
                      >
                        <Ionicons name="person-add-outline" size={16} color={Colors.primary} />
                        <Text style={styles.resultText}>{m.fullName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Actions */}
            {canManage ? (
              <View style={styles.actions}>
                {isOwner && Platform.OS !== 'web' ? (
                  <Button
                    title="Add to Calendar"
                    variant="secondary"
                    onPress={() => {
                      void addBookingToCalendarWithFeedback(
                        bookingWithDetailsToCalendarDetails(d, { facilityName: d.facilityName }),
                        { bookingConfirmed: false }
                      );
                    }}
                  />
                ) : null}
                {onEdit ? <Button title="Edit Booking" variant="secondary" onPress={() => onEdit(d)} /> : null}
                <Button
                  title="Cancel Booking"
                  variant="destructive"
                  onPress={handleCancelBooking}
                  loading={busy === 'cancel'}
                  disabled={busy !== null}
                />
              </View>
            ) : (
              <Text style={styles.footnote}>You can only edit or cancel your own bookings.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  // flexShrink, not flex: 1 — the sheet is content-sized with a maxHeight (see EditBookingModal).
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 2 },
  courtName: { fontSize: FontSize.lg, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  line: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  badgeLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  badge: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: FontSize.xs, color: Colors.text },
  splitBox: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.info + '66',
    backgroundColor: Colors.info + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 4,
  },
  splitTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  shareName: { fontSize: FontSize.sm, color: Colors.text, flexShrink: 1 },
  shareStatus: { fontSize: FontSize.sm, color: Colors.textSecondary },
  splitHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  flex1: { flex: 1 },
  mtSm: { marginTop: Spacing.sm },
  infoBox: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  infoTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  infoText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  rosterBox: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 6,
  },
  rosterTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  removeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.error },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  resultText: { fontSize: FontSize.sm, color: Colors.text },
  actions: { marginTop: Spacing.lg, gap: Spacing.sm },
  footnote: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.lg },
});
