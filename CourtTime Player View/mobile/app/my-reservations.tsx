/**
 * My Reservations — mirrors web's MyReservations page: Upcoming / Past tabs,
 * search, and status / facility / date-range filters over the member's own
 * bookings. Tapping a card opens the ReservationSheet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { api } from '../src/api/client';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { Input } from '../src/components/Input';
import { MiniCalendar } from '../src/components/MiniCalendar';
import { ReservationSheet } from '../src/components/ReservationSheet';
import { EditBookingModal } from '../src/components/EditBookingModal';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { formatTimeLabel } from '../../shared/utils/scheduleOverview';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, TouchTarget } from '../src/constants/theme';
import type { BookingWithDetails } from '../src/types/database';
import { filterReservations, formatReservationDate } from '../src/utils/reservationFilters';

export const ErrorBoundary = createRouteErrorBoundary('My Reservations');

type TabType = 'upcoming' | 'past';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: Colors.success,
  pending: Colors.warning,
  cancelled: Colors.error,
  completed: Colors.textMuted,
};


export default function MyReservationsScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabType>('upcoming');
  const [reservations, setReservations] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [openCalendar, setOpenCalendar] = useState<'from' | 'to' | null>(null);

  const [selected, setSelected] = useState<BookingWithDetails | null>(null);
  const [editing, setEditing] = useState<BookingWithDetails | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const res = await api.get(`/api/bookings/user/${user.id}?upcoming=${tab === 'upcoming' ? 'true' : 'false'}`);
    const list = res.success ? ((res.data as any)?.bookings ?? (res.data as any)?.data?.bookings) : null;
    setReservations(Array.isArray(list) ? list : []);
    setLoading(false);
  }, [user?.id, tab]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setFacilityFilter('all');
    setFromDate('');
    setToDate('');
    setOpenCalendar(null);
  };

  const facilityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    reservations.forEach((r) => {
      if (r.facilityId && r.facilityName) seen.set(r.facilityId, r.facilityName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [reservations]);

  const filtered = useMemo(
    () => filterReservations(reservations, { status, facilityId: facilityFilter, fromDate, toDate, search }),
    [reservations, status, facilityFilter, fromDate, toDate, search]
  );
  const hasActiveFilters = status !== 'all' || facilityFilter !== 'all' || !!fromDate || !!toDate || !!search;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'My Reservations' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['upcoming', 'past'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => {
                setTab(t);
                clearFilters();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={t === 'upcoming' ? 'Upcoming reservations' : 'Past reservations'}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'upcoming' ? 'Upcoming' : 'Past'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search + filters */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <Input
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by court or facility…"
            accessibilityLabel="Search reservations"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.filterButton, (showFilters || hasActiveFilters) && styles.filterButtonActive]}
            onPress={() => setShowFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Filters"
          >
            <Ionicons name="options-outline" size={18} color={showFilters || hasActiveFilters ? Colors.primary : Colors.text} />
          </TouchableOpacity>
        </View>

        {showFilters ? (
          <View style={styles.filters}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={status === o.value} onPress={() => setStatus(o.value)} />
              ))}
            </View>
            {facilityOptions.length > 1 ? (
              <>
                <Text style={styles.filterLabel}>Facility</Text>
                <View style={styles.chipRow}>
                  <Chip label="All" selected={facilityFilter === 'all'} onPress={() => setFacilityFilter('all')} />
                  {facilityOptions.map((f) => (
                    <Chip key={f.id} label={f.name} selected={facilityFilter === f.id} onPress={() => setFacilityFilter(f.id)} />
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.dateRow}>
              <DateField
                label="From"
                value={fromDate}
                open={openCalendar === 'from'}
                onToggle={() => setOpenCalendar(openCalendar === 'from' ? null : 'from')}
                onClear={() => setFromDate('')}
              />
              <DateField
                label="To"
                value={toDate}
                open={openCalendar === 'to'}
                onToggle={() => setOpenCalendar(openCalendar === 'to' ? null : 'to')}
                onClear={() => setToDate('')}
              />
            </View>
            {openCalendar ? (
              <MiniCalendar
                selectedDate={(openCalendar === 'from' ? fromDate : toDate) || new Date().toISOString().slice(0, 10)}
                onSelectDate={(d) => {
                  if (openCalendar === 'from') setFromDate(d);
                  else setToDate(d);
                  setOpenCalendar(null);
                }}
              />
            ) : null}
            {hasActiveFilters ? (
              <TouchableOpacity onPress={clearFilters} accessibilityRole="button" accessibilityLabel="Clear filters">
                <Text style={styles.clearText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!loading ? (
          <Text style={styles.count}>
            {filtered.length} {filtered.length === 1 ? 'reservation' : 'reservations'}
            {hasActiveFilters ? ' matching filters' : ''}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="calendar-clear-outline"
            title={
              hasActiveFilters
                ? 'No reservations match your filters'
                : tab === 'upcoming'
                  ? 'No upcoming reservations'
                  : 'No past reservations'
            }
            description={hasActiveFilters ? 'Try widening your filters.' : 'Your court bookings will appear here.'}
            actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
            onAction={hasActiveFilters ? clearFilters : undefined}
          />
        ) : (
          filtered.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.card}
              onPress={() => setSelected(r)}
              accessibilityRole="button"
              accessibilityLabel={`${r.courtName}, ${formatReservationDate(String(r.bookingDate))}, ${r.status}`}
            >
              <View style={styles.cardMain}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.court} numberOfLines={1}>
                    {r.courtName || 'Court'}
                  </Text>
                  {r.facilityName ? (
                    <Text style={styles.facility} numberOfLines={1}>
                      · {r.facilityName}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  {formatReservationDate(String(r.bookingDate))} · {formatTimeLabel(r.startTime)} – {formatTimeLabel(r.endTime)}
                  {r.durationMinutes ? ` (${r.durationMinutes} min)` : ''}
                </Text>
                {r.notes ? (
                  <Text style={styles.notes} numberOfLines={1}>
                    {r.notes}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.statusBadge, { borderColor: STATUS_COLORS[r.status] ?? Colors.border }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] ?? Colors.textSecondary }]}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      <ReservationSheet
        booking={selected}
        visible={selected !== null}
        onClose={() => setSelected(null)}
        onChanged={load}
        onEdit={
          tab === 'upcoming'
            ? (b) => {
                setSelected(null);
                setEditing(b);
              }
            : undefined
        }
      />
      <EditBookingModal booking={editing} visible={editing !== null} onClose={() => setEditing(null)} onSaved={load} />
    </View>
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

function DateField({
  label,
  value,
  open,
  onToggle,
  onClear,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.filterLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateButton} onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${label} date`}>
        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
        <Text style={[styles.dateText, !value && styles.placeholder]}>{value || 'Any'}</Text>
        {value ? (
          <TouchableOpacity onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label} date`}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.sm },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: 3,
    alignSelf: 'flex-start',
  },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.textInverse },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  filterButton: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  filterButtonActive: { borderColor: Colors.primary },
  filters: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  filterLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary },
  dateRow: { flexDirection: 'row', gap: Spacing.sm },
  dateField: { flex: 1 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  dateText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  placeholder: { color: Colors.textMuted },
  clearText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary, marginTop: Spacing.xs },
  count: { fontSize: FontSize.xs, color: Colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  cardMain: { flex: 1, minWidth: 0, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  court: { fontSize: FontSize.md, fontFamily: FontFamily.bold, fontWeight: '600', color: Colors.text },
  facility: { fontSize: FontSize.xs, color: Colors.textMuted, flexShrink: 1 },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  notes: { fontSize: FontSize.xs, color: Colors.textMuted },
  statusBadge: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: FontSize.xs, fontWeight: '600' },
});
