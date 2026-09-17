/**
 * Admin Bookings: Reservations (list/filter/manage) + Create (book on behalf of a member or a walk-in guest).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import {
  getAdminBookings,
  updateBookingStatus,
  collectFrontDeskFee,
  getFacilityCourts,
  updateBookingSeries,
  deleteBookingSeries,
  updateBookingSeriesInstances,
  deleteBookingSeriesInstances,
  type AdminBookingRow,
  type AdminCourtRow,
  type SeriesEditPayload,
} from '../../src/api/admin';
import { groupBookingsBySeries, minutesBetween } from '../../src/utils/adminBookings';
import { generateWeeklyDates, WEEKDAY_NAMES } from '../../src/utils/recurringDates';
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

  // Recurring series controls (web: Show Dates / Edit Entire Series / Edit or Delete Selected Dates)
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [selectedSeriesDates, setSelectedSeriesDates] = useState<Record<string, string[]>>({});
  const [seriesEdit, setSeriesEdit] = useState<{
    mode: 'all' | 'selected';
    seriesId: string;
    bookingIds: string[];
    startTime: string;
    endTime: string;
    durationMinutes: string;
    bookingType: string;
    notes: string;
  } | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState(false);

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
  const groups = useMemo(() => groupBookingsBySeries(filtered.slice(0, 120)), [filtered]);

  const toggleSeriesDate = (seriesId: string, bookingId: string) =>
    setSelectedSeriesDates((prev) => {
      const existing = prev[seriesId] || [];
      return { ...prev, [seriesId]: existing.includes(bookingId) ? existing.filter((id) => id !== bookingId) : [...existing, bookingId] };
    });

  const openSeriesEdit = (mode: 'all' | 'selected', seriesId: string, seed: AdminBookingRow, bookingIds: string[] = []) =>
    setSeriesEdit({
      mode,
      seriesId,
      bookingIds,
      startTime: seed.startTime || '',
      endTime: seed.endTime || '',
      durationMinutes: String(seed.durationMinutes || minutesBetween(seed.startTime, seed.endTime) || 60),
      bookingType: seed.bookingType || '',
      notes: seed.notes || '',
    });

  const confirmDeleteSeries = (seriesId: string) =>
    Alert.alert('Delete series', 'Delete all reservations in this recurring series?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteBookingSeries(seriesId);
            if (res.success) await loadBookings();
            else showApiErrorAlert(res, 'Failed to delete recurring series');
          })();
        },
      },
    ]);

  const confirmDeleteSelected = (seriesId: string) => {
    const ids = selectedSeriesDates[seriesId] || [];
    if (ids.length === 0) {
      showAlert('Select dates', 'Select at least one date first.');
      return;
    }
    Alert.alert('Delete selected dates', `Delete ${ids.length} selected date${ids.length === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteBookingSeriesInstances(seriesId, ids);
            if (res.success) {
              setSelectedSeriesDates((prev) => ({ ...prev, [seriesId]: [] }));
              await loadBookings();
            } else showApiErrorAlert(res, 'Failed to delete selected dates');
          })();
        },
      },
    ]);
  };

  async function submitSeriesEdit() {
    if (!seriesEdit) return;
    const duration = Number(seriesEdit.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      showAlert('Duration', 'Duration must be a positive number.');
      return;
    }
    const withSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t);
    const payload: SeriesEditPayload = {
      startTime: withSeconds(seriesEdit.startTime.trim()),
      endTime: withSeconds(seriesEdit.endTime.trim()),
      durationMinutes: duration,
      bookingType: seriesEdit.bookingType.trim() || undefined,
      notes: seriesEdit.notes.trim() || undefined,
    };
    setSeriesSubmitting(true);
    const res =
      seriesEdit.mode === 'all'
        ? await updateBookingSeries(seriesEdit.seriesId, payload)
        : await updateBookingSeriesInstances(seriesEdit.seriesId, { bookingIds: seriesEdit.bookingIds, ...payload });
    setSeriesSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Failed to update recurring reservation');
      return;
    }
    if (seriesEdit.mode === 'selected') setSelectedSeriesDates((prev) => ({ ...prev, [seriesEdit.seriesId]: [] }));
    setSeriesEdit(null);
    await loadBookings();
  }

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
          groups.map((group) => {
            if (group.kind === 'series') {
              const seed = group.bookings[0]!;
              const expanded = !!expandedSeries[group.seriesId];
              const selected = selectedSeriesDates[group.seriesId] || [];
              const allSelected = group.bookings.length > 0 && group.bookings.every((b) => selected.includes(b.id));
              return (
                <View key={`series-${group.seriesId}`} style={[styles.bookingItem, styles.seriesItem]}>
                  <Text style={styles.bookingTitle}>
                    <Ionicons name="repeat" size={12} color={Colors.primary} /> Recurring • {seed.courtName || 'Court'} • {seed.walkInName || seed.userName || 'Member'}
                  </Text>
                  <Text style={styles.bookingMeta}>
                    {formatTime(seed.startTime)} - {formatTime(seed.endTime)} • {group.bookings.length} date{group.bookings.length === 1 ? '' : 's'} in range
                  </Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setExpandedSeries((p) => ({ ...p, [group.seriesId]: !expanded }))}>
                      <Text style={styles.actionDefault}>{expanded ? 'Hide dates' : 'Show dates'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openSeriesEdit('all', group.seriesId, seed)}>
                      <Text style={styles.actionDefault}>Edit series</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDeleteSeries(group.seriesId)}>
                      <Text style={styles.actionCancel}>Delete series</Text>
                    </TouchableOpacity>
                  </View>
                  {expanded ? (
                    <View style={styles.seriesDates}>
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectedSeriesDates((p) => ({ ...p, [group.seriesId]: allSelected ? [] : group.bookings.map((b) => b.id) }))}>
                          <Text style={styles.actionDefault}>{allSelected ? 'Clear all' : 'Select all dates'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => selected.length ? openSeriesEdit('selected', group.seriesId, seed, selected) : showAlert('Select dates', 'Select at least one date first.')}>
                          <Text style={styles.actionDefault}>Edit selected</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDeleteSelected(group.seriesId)}>
                          <Text style={styles.actionCancel}>Delete selected</Text>
                        </TouchableOpacity>
                      </View>
                      {group.bookings.map((b) => {
                        const isSel = selected.includes(b.id);
                        return (
                          <TouchableOpacity
                            key={b.id}
                            style={styles.seriesDateRow}
                            onPress={() => toggleSeriesDate(group.seriesId, b.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSel }}
                            accessibilityLabel={`${b.bookingDate} ${formatTime(b.startTime)}${isSel ? ', selected' : ''}`}
                          >
                            <Ionicons name={isSel ? 'checkbox' : 'square-outline'} size={18} color={isSel ? Colors.primary : Colors.textMuted} />
                            <Text style={styles.seriesDateText}>
                              {b.bookingDate} • {formatTime(b.startTime)} - {formatTime(b.endTime)} • {b.status}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            }
            const b = group.booking;
            const busy = busyId === b.id;
            const canCollectFee = !!b.frontDeskAmountDueCents && !b.frontDeskCollectedAt;
            return (
              <View key={b.id} style={styles.bookingItem}>
                <Text style={styles.bookingTitle}>
                  {b.courtName || 'Court'} • {b.walkInName || b.userName || 'Member'}
                </Text>
                <Text style={styles.bookingMeta}>
                  {b.bookingDate} • {formatTime(b.startTime)} - {formatTime(b.endTime)} • {b.status}
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

      {/* Series edit (web: "Edit Entire Recurring Series" / "Edit Selected Dates") */}
      <Modal visible={seriesEdit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSeriesEdit(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSeriesEdit(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{seriesEdit?.mode === 'all' ? 'Edit Entire Series' : 'Edit Selected Dates'}</Text>
            <TouchableOpacity onPress={() => void submitSeriesEdit()} disabled={seriesSubmitting} accessibilityRole="button" accessibilityLabel="Save changes">
              <Text style={[styles.modalSave, seriesSubmitting && { opacity: 0.5 }]}>{seriesSubmitting ? '…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          {seriesEdit ? (
            <ScrollView contentContainerStyle={{ padding: Spacing.md }} keyboardShouldPersistTaps="handled">
              {seriesEdit.mode === 'selected' ? (
                <Text style={styles.emptyText}>Applies to {seriesEdit.bookingIds.length} selected date{seriesEdit.bookingIds.length === 1 ? '' : 's'}.</Text>
              ) : null}
              <Text style={styles.label}>Start time (HH:MM)</Text>
              <Input value={seriesEdit.startTime} onChangeText={(v) => setSeriesEdit({ ...seriesEdit, startTime: v })} placeholder="18:00" autoCapitalize="none" />
              <Text style={styles.label}>End time (HH:MM)</Text>
              <Input value={seriesEdit.endTime} onChangeText={(v) => setSeriesEdit({ ...seriesEdit, endTime: v })} placeholder="19:00" autoCapitalize="none" />
              <Text style={styles.label}>Duration (minutes)</Text>
              <Input value={seriesEdit.durationMinutes} onChangeText={(v) => setSeriesEdit({ ...seriesEdit, durationMinutes: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" />
              <Text style={styles.label}>Reservation type (optional)</Text>
              <Input value={seriesEdit.bookingType} onChangeText={(v) => setSeriesEdit({ ...seriesEdit, bookingType: v })} placeholder="match" autoCapitalize="none" />
              <Text style={styles.label}>Notes (optional)</Text>
              <Input value={seriesEdit.notes} onChangeText={(v) => setSeriesEdit({ ...seriesEdit, notes: v })} multiline style={styles.multiline} />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
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
  // Recurring (web AdminBooking): weekly on chosen days until an end date; members only.
  const [recurring, setRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');

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

  const recurringActive = recurring && !isWalkIn;
  const canSubmit =
    !!facilityId &&
    selectedCourtIds.length > 0 &&
    !!startTime &&
    (isWalkIn ? walkInName.trim().length > 0 : !!memberId) &&
    (!recurringActive || (recurringDays.length > 0 && !!recurringEndDate));

  async function submit() {
    if (!facilityId || !canSubmit || !startTime) return;
    setSubmitting(true);
    const [sh, sm] = startTime.split(':').map(Number);
    const endMinutes = sh * 60 + sm + durationMinutes;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;

    if (recurringActive) {
      const dates = generateWeeklyDates(date, recurringDays, recurringEndDate);
      if (dates.length === 0) {
        setSubmitting(false);
        showAlert('Recurring', 'Pick at least one weekday and an end date on or after the start date.');
        return;
      }
      const instances = dates.flatMap((bookingDate) =>
        selectedCourtIds.map((courtId) => ({ courtId, bookingDate, startTime, endTime, durationMinutes }))
      );
      const payload = { userId: memberId, facilityId, bookingType, notes: notes.trim() || undefined, instances, bookedByStaffId: adminUserId };
      let res = await api.post('/api/bookings/recurring-series', payload);
      if (!res.success && res.conflicts?.length) {
        const proceed = await new Promise<boolean>((resolve) =>
          showAlert(
            'Booking Conflicts',
            `${res.conflicts!.length} date(s) conflict with existing reservations. Book the other dates and skip the conflicts?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Book the rest', onPress: () => resolve(true) },
            ]
          )
        );
        if (!proceed) {
          setSubmitting(false);
          return;
        }
        res = await api.post('/api/bookings/recurring-series', { ...payload, skipConflicts: true });
      }
      setSubmitting(false);
      if (res.success) {
        const created = (res.data as { bookings?: unknown[] } | undefined)?.bookings?.length ?? instances.length;
        showAlert('Created', `Recurring series created: ${created} booking${created === 1 ? '' : 's'}.`);
        setNotes('');
      } else {
        showApiErrorAlert(res, 'Could not create recurring series');
      }
      return;
    }

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

        {!isWalkIn ? (
          <>
            <Text style={styles.label}>Repeat weekly</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.chip, !recurring && styles.chipSelected]} onPress={() => setRecurring(false)} accessibilityRole="button" accessibilityLabel="One-time booking">
                <Text style={[styles.chipText, !recurring && styles.chipTextSelected]}>One time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, recurring && styles.chipSelected]} onPress={() => setRecurring(true)} accessibilityRole="button" accessibilityLabel="Recurring weekly booking">
                <Text style={[styles.chipText, recurring && styles.chipTextSelected]}>Recurring</Text>
              </TouchableOpacity>
            </View>
            {recurring ? (
              <>
                <Text style={styles.label}>Days of week</Text>
                <View style={styles.chipsWrap}>
                  {WEEKDAY_NAMES.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.chip, recurringDays.includes(d) && styles.chipSelected]}
                      onPress={() => setRecurringDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: recurringDays.includes(d) }}
                      accessibilityLabel={d}
                    >
                      <Text style={[styles.chipText, recurringDays.includes(d) && styles.chipTextSelected]}>{d.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Repeat until (YYYY-MM-DD)</Text>
                <Input value={recurringEndDate} onChangeText={setRecurringEndDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </>
            ) : null}
          </>
        ) : null}

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
  seriesItem: { borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '06' },
  seriesDates: { marginTop: Spacing.sm, gap: 4 },
  seriesDateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  seriesDateText: { fontSize: FontSize.xs, color: Colors.text, flexShrink: 1 },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  bookingTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  bookingMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, marginBottom: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { paddingVertical: 2 },
  actionDefault: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  actionCancel: { fontSize: FontSize.xs, color: Colors.error, fontWeight: '700' },
  actionDone: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '700' },
  actionWarning: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '700' },
});
