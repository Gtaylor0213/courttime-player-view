/**
 * Admin Bookings: Reservations (list/filter/manage) + Create (book on behalf of a member or a walk-in guest).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import {
  getAdminBookings,
  updateBookingStatus,
  collectFrontDeskFee,
  getFacilityCourts,
  type AdminBookingRow,
  type AdminCourtRow,
} from '../../src/api/admin';
import { buildTimeSlotsFromAvailability, type CourtAvailabilityData } from '../../../shared/utils/courtAvailability';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';

export const ErrorBoundary = createRouteErrorBoundary('Admin Bookings');

type MemberOption = { userId: string; fullName: string };

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(value: string) {
  const [hStr, mStr = '00'] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STATUS_FILTERS = ['all', 'confirmed', 'pending', 'cancelled', 'completed'] as const;
const DURATION_OPTIONS = [30, 60, 90, 120];

export default function AdminBookingsScreen() {
  const { user, facilityId } = useAuth();
  const [activeTab, setActiveTab] = useState<'reservations' | 'create'>('reservations');
  const [courts, setCourts] = useState<AdminCourtRow[]>([]);

  useEffect(() => {
    if (!facilityId) return;
    void (async () => {
      const res = await getFacilityCourts(facilityId);
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data as { courts?: AdminCourtRow[] }).courts || [];
        setCourts(list);
      }
    })();
  }, [facilityId]);

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'reservations' && styles.tabBtnActive]}
          onPress={() => setActiveTab('reservations')}
        >
          <Text style={[styles.tabText, activeTab === 'reservations' && styles.tabTextActive]}>Reservations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'create' && styles.tabBtnActive]}
          onPress={() => setActiveTab('create')}
        >
          <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>Create</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'reservations' ? (
        <ReservationsTab facilityId={facilityId} courts={courts} adminUserId={user?.id} />
      ) : (
        <CreateTab facilityId={facilityId} courts={courts} adminUserId={user?.id} />
      )}
    </View>
  );
}

// ── Reservations tab ──

function ReservationsTab({
  facilityId,
  courts,
  adminUserId,
}: {
  facilityId: string | null | undefined;
  courts: AdminCourtRow[];
  adminUserId: string | undefined;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState(todayYmd());
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [courtId, setCourtId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const res = await getAdminBookings(facilityId, { startDate, endDate, status, courtId });
    if (res.success && res.data?.data) {
      setBookings(res.data.data.bookings || []);
    } else {
      showApiErrorAlert(res, 'Could not load bookings');
    }
    setLoading(false);
  }, [facilityId, startDate, endDate, status, courtId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }, [loadBookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      [b.userName, b.courtName, b.walkInName].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [bookings, search]);

  async function doAction(action: () => Promise<void>, bookingId: string) {
    setBusyId(bookingId);
    try {
      await action();
      await loadBookings();
    } finally {
      setBusyId(null);
    }
  }

  const patchStatus = (bookingId: string, next: 'cancelled' | 'completed') =>
    doAction(async () => {
      const res = await updateBookingStatus(bookingId, next);
      if (!res.success) showApiErrorAlert(res, 'Update failed');
    }, bookingId);

  const noShow = (bookingId: string) =>
    doAction(async () => {
      const res = await api.post(`/api/bookings/${bookingId}/no-show`, { markedBy: adminUserId });
      if (!res.success) showApiErrorAlert(res, 'No-show failed');
    }, bookingId);

  const checkIn = (bookingId: string) =>
    doAction(async () => {
      const res = await api.post(`/api/bookings/${bookingId}/check-in`, {});
      if (!res.success) showApiErrorAlert(res, 'Check-in failed');
    }, bookingId);

  const collectFee = (bookingId: string) =>
    doAction(async () => {
      const res = await collectFrontDeskFee(bookingId);
      if (!res.success) showApiErrorAlert(res, 'Could not collect fee');
    }, bookingId);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Filters</Text>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>From</Text>
            <Input value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>To</Text>
            <Input value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
          </View>
        </View>
        <Text style={styles.label}>Status</Text>
        <View style={styles.chipsWrap}>
          {STATUS_FILTERS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, status === s && styles.chipSelected]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.chipText, status === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Court</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              style={[styles.chip, courtId === 'all' && styles.chipSelected]}
              onPress={() => setCourtId('all')}
            >
              <Text style={[styles.chipText, courtId === 'all' && styles.chipTextSelected]}>All courts</Text>
            </TouchableOpacity>
            {courts.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, courtId === c.id && styles.chipSelected]}
                onPress={() => setCourtId(c.id)}
              >
                <Text style={[styles.chipText, courtId === c.id && styles.chipTextSelected]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.label}>Search</Text>
        <Input value={search} onChangeText={setSearch} placeholder="Member, court, or guest name" />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>
          {loading ? 'Loading…' : `${filtered.length} booking${filtered.length === 1 ? '' : 's'}`}
        </Text>
        {!loading && filtered.length === 0 ? (
          <Text style={styles.emptyText}>No bookings match these filters.</Text>
        ) : (
          filtered.slice(0, 60).map((b) => {
            const busy = busyId === b.id;
            const canCollectFee = !!b.frontDeskAmountDueCents && !b.frontDeskCollectedAt;
            return (
              <View key={b.id} style={styles.bookingItem}>
                <Text style={styles.bookingTitle}>
                  {b.courtName || 'Court'} • {b.walkInName || b.userName || 'Member'}
                </Text>
                <Text style={styles.bookingMeta}>
                  {b.bookingDate} • {formatTime(b.startTime)} - {formatTime(b.endTime)} • {b.status}
                  {b.isRecurring ? ' • recurring' : ''}
                </Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity disabled={busy} style={styles.actionBtn} onPress={() => patchStatus(b.id, 'cancelled')}>
                    <Text style={styles.actionCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} style={styles.actionBtn} onPress={() => patchStatus(b.id, 'completed')}>
                    <Text style={styles.actionDone}>Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} style={styles.actionBtn} onPress={() => checkIn(b.id)}>
                    <Text style={styles.actionDefault}>Check-in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} style={styles.actionBtn} onPress={() => noShow(b.id)}>
                    <Text style={styles.actionWarning}>No-show</Text>
                  </TouchableOpacity>
                  {canCollectFee ? (
                    <TouchableOpacity disabled={busy} style={styles.actionBtn} onPress={() => collectFee(b.id)}>
                      <Text style={styles.actionDone}>Collect fee</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

// ── Create tab ──

function CreateTab({
  facilityId,
  courts,
  adminUserId,
}: {
  facilityId: string | null | undefined;
  courts: AdminCourtRow[];
  adminUserId: string | undefined;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');

  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayYmd());
  const [availableStarts, setAvailableStarts] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [bookingType, setBookingType] = useState('match');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!facilityId) return;
    void (async () => {
      const res = await api.get(`/api/members/${facilityId}`);
      if (res.success) {
        const raw = Array.isArray((res as any).members) ? (res as any).members : [];
        setMembers(raw.map((m: any) => ({ userId: m.userId, fullName: m.fullName })));
      }
    })();
  }, [facilityId]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = q ? members.filter((m) => m.fullName.toLowerCase().includes(q)) : members;
    return list.slice(0, 25);
  }, [members, memberSearch]);

  // Union of open+unbooked start times across every selected court, at this date.
  useEffect(() => {
    if (!date || selectedCourtIds.length === 0) {
      setAvailableStarts([]);
      setStartTime('');
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        selectedCourtIds.map((id) => api.get(`/api/court-config/${id}/availability?date=${date}`))
      );
      if (cancelled) return;
      const starts = new Set<string>();
      for (const res of results) {
        if (!res.success || !res.data) continue;
        const slots = buildTimeSlotsFromAvailability(res.data as CourtAvailabilityData, date, todayYmd());
        slots.filter((s) => s.available).forEach((s) => starts.add(s.startTime));
      }
      const sorted = [...starts].sort();
      setAvailableStarts(sorted);
      setStartTime((prev) => (prev && sorted.includes(prev) ? prev : sorted[0] || ''));
    })();
    return () => {
      cancelled = true;
    };
  }, [date, selectedCourtIds]);

  function toggleCourt(id: string) {
    setSelectedCourtIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  const canSubmit =
    !!facilityId &&
    selectedCourtIds.length > 0 &&
    !!startTime &&
    (isWalkIn ? walkInName.trim().length > 0 : !!memberId);

  async function submit() {
    if (!facilityId || !canSubmit || !startTime) return;
    setSubmitting(true);
    const [sh, sm] = startTime.split(':').map(Number);
    const endMinutes = sh * 60 + sm + durationMinutes;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;

    let successCount = 0;
    let firstError: string | undefined;
    for (const cId of selectedCourtIds) {
      const res = await api.post('/api/bookings', {
        courtId: cId,
        userId: isWalkIn ? adminUserId : memberId,
        facilityId,
        bookingDate: date,
        startTime,
        endTime,
        durationMinutes,
        bookingType,
        notes: notes.trim() || undefined,
        walkInName: isWalkIn ? walkInName.trim() : undefined,
        bookedByStaffId: adminUserId,
      });
      if (res.success) {
        successCount += 1;
      } else if (!firstError) {
        firstError = res.error;
      }
    }
    setSubmitting(false);

    if (successCount === selectedCourtIds.length) {
      showAlert('Created', `Booking created on ${successCount} court${successCount === 1 ? '' : 's'}.`);
      setMemberId('');
      setWalkInName('');
      setNotes('');
    } else if (successCount > 0) {
      showAlert('Partially created', `${successCount} of ${selectedCourtIds.length} courts booked. ${firstError || ''}`);
    } else {
      showAlert('Failed', firstError || 'Could not create booking.');
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Who is this booking for?</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.chip, !isWalkIn && styles.chipSelected]}
            onPress={() => setIsWalkIn(false)}
          >
            <Text style={[styles.chipText, !isWalkIn && styles.chipTextSelected]}>Member</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, isWalkIn && styles.chipSelected]}
            onPress={() => setIsWalkIn(true)}
          >
            <Text style={[styles.chipText, isWalkIn && styles.chipTextSelected]}>Walk-in guest</Text>
          </TouchableOpacity>
        </View>

        {isWalkIn ? (
          <>
            <Text style={styles.label}>Guest name</Text>
            <Input value={walkInName} onChangeText={setWalkInName} placeholder="Jane Smith" />
          </>
        ) : (
          <>
            <Text style={styles.label}>Search member</Text>
            <Input value={memberSearch} onChangeText={setMemberSearch} placeholder="Name" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              <View style={styles.chipsWrap}>
                {filteredMembers.map((m) => (
                  <TouchableOpacity
                    key={m.userId}
                    style={[styles.chip, memberId === m.userId && styles.chipSelected]}
                    onPress={() => setMemberId(m.userId)}
                  >
                    <Text style={[styles.chipText, memberId === m.userId && styles.chipTextSelected]}>
                      {m.fullName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Court(s) &amp; date</Text>
        <View style={styles.chipsWrap}>
          {courts.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, selectedCourtIds.includes(c.id) && styles.chipSelected]}
              onPress={() => toggleCourt(c.id)}
            >
              <Text style={[styles.chipText, selectedCourtIds.includes(c.id) && styles.chipTextSelected]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <Input value={date} onChangeText={setDate} />

        <Text style={styles.label}>Start time</Text>
        {selectedCourtIds.length === 0 ? (
          <Text style={styles.emptyText}>Select a court to see open times.</Text>
        ) : availableStarts.length === 0 ? (
          <Text style={styles.emptyText}>No open slots on this date.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipsWrap}>
              {availableStarts.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, startTime === t && styles.chipSelected]}
                  onPress={() => setStartTime(t)}
                >
                  <Text style={[styles.chipText, startTime === t && styles.chipTextSelected]}>{formatTime(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        <Text style={styles.label}>Duration</Text>
        <View style={styles.chipsWrap}>
          {DURATION_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.chip, durationMinutes === d && styles.chipSelected]}
              onPress={() => setDurationMinutes(d)}
            >
              <Text style={[styles.chipText, durationMinutes === d && styles.chipTextSelected]}>{d} min</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <Text style={styles.label}>Notes (optional)</Text>
        <Input value={notes} onChangeText={setNotes} placeholder="Notes for this booking" multiline style={styles.multiline} />
        <Button title="Create Booking" onPress={submit} loading={submitting} disabled={!canSubmit || submitting} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  tabRow: { flexDirection: 'row', padding: Spacing.md, paddingBottom: 0, gap: Spacing.sm },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontFamily: FontFamily.medium },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm },
  col: { flex: 1 },
  chipsRow: { marginBottom: Spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  multiline: { minHeight: 70, textAlignVertical: 'top', marginBottom: Spacing.sm },
  bookingItem: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bookingTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  bookingMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, marginBottom: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { paddingVertical: 2 },
  actionDefault: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  actionCancel: { fontSize: FontSize.xs, color: Colors.error, fontWeight: '700' },
  actionDone: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '700' },
  actionWarning: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '700' },
});
