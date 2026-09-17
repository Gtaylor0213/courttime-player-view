/**
 * QuickReserveSheet
 * Web's Quick Reservation page as a sheet: pick a day (next 7), filter by
 * court type, and see each court's open windows; tap a start time to book it,
 * or take the one-tap "Book next open hour" the app already offered.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { buildTimeSlotsFromAvailability, openStartWindows, type CourtAvailabilityData, type TimeSlot } from '../../../shared/utils/courtAvailability';
import { filterCourtsByType, getCourtTypes } from '../../../shared/utils/courtTypeFilter';
import { formatTimeLabel } from '../../../shared/utils/scheduleOverview';
import { Button } from './Button';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import type { Court } from '../types/database';

interface Props {
  visible: boolean;
  courts: Court[];
  onClose: () => void;
  /** Member chose a specific court + start; the caller opens the booking form. */
  onPickSlot: (date: string, court: Court, startTime: string, endTime: string) => void;
  /** The existing one-tap action (earliest open hour today). */
  onQuickBook: () => void;
  quickBooking?: boolean;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function QuickReserveSheet({ visible, courts, onClose, onPickSlot, onQuickBook, quickBooking = false }: Props) {
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return { value: ymd(d), label: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) };
      }),
    []
  );
  const [date, setDate] = useState(days[0]!.value);
  const [courtType, setCourtType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotsByCourt, setSlotsByCourt] = useState<Record<string, TimeSlot[]>>({});

  const bookable = useMemo(
    () => courts.filter((c) => (c.status ?? 'available') === 'available' && !c.isWalkUp),
    [courts]
  );
  const courtTypes = useMemo(() => getCourtTypes(bookable), [bookable]);
  const visibleCourts = useMemo(() => filterCourtsByType(bookable, courtType), [bookable, courtType]);

  const load = useCallback(async () => {
    if (!visible || bookable.length === 0) return;
    setLoading(true);
    const today = ymd(new Date());
    const results = await Promise.all(
      bookable.map(async (court) => {
        const res = await api.get(`/api/court-config/${court.id}/availability?date=${date}`);
        const slots = res.success && res.data ? buildTimeSlotsFromAvailability(res.data as CourtAvailabilityData, date, today) : [];
        return [court.id, slots] as const;
      })
    );
    setSlotsByCourt(Object.fromEntries(results));
    setLoading(false);
  }, [visible, bookable, date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (visible) setDate(days[0]!.value);
  }, [visible, days]);

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Quick Reserve</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <Button
            title={quickBooking ? 'Finding a court…' : 'Book next open hour today'}
            onPress={onQuickBook}
            loading={quickBooking}
            leftIcon={<Ionicons name="flash" size={14} color={Colors.textInverse} />}
            accessibilityLabel="Book the next open hour today"
            style={styles.quickButton}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
            {days.map((d) => (
              <Chip key={d.value} label={d.label} selected={date === d.value} onPress={() => setDate(d.value)} />
            ))}
          </ScrollView>
          {courtTypes.length > 1 ? (
            <View style={[styles.chipRow, { paddingHorizontal: Spacing.lg }]}>
              <Chip label="All courts" selected={courtType === null} onPress={() => setCourtType(null)} />
              {courtTypes.map((t) => (
                <Chip key={t} label={t} selected={courtType === t} onPress={() => setCourtType(t)} />
              ))}
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.lg }} />
            ) : visibleCourts.length === 0 ? (
              <Text style={styles.empty}>No courts available matching your filters.</Text>
            ) : (
              visibleCourts.map((court) => {
                const slots = slotsByCourt[court.id] ?? [];
                const windows = openStartWindows(slots);
                return (
                  <View key={court.id} style={styles.courtCard}>
                    <View style={styles.courtHeader}>
                      <Text style={styles.courtName}>{court.name}</Text>
                      <Text style={styles.courtMeta}>
                        {slots.length === 0 ? 'Closed' : `${windows.length}/${slots.length} slots open`}
                      </Text>
                    </View>
                    {windows.length === 0 ? (
                      <Text style={styles.courtEmpty}>{slots.length === 0 ? 'Not open on this day.' : 'Fully booked.'}</Text>
                    ) : (
                      <View style={styles.slotRow}>
                        {windows.map((w) => (
                          <TouchableOpacity
                            key={w.startTime}
                            style={styles.slot}
                            onPress={() => onPickSlot(date, court, w.startTime, w.runEnd)}
                            accessibilityRole="button"
                            accessibilityLabel={`Book ${court.name} at ${formatTimeLabel(w.startTime)}`}
                          >
                            <Text style={styles.slotText}>{formatTimeLabel(w.startTime)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, selected && styles.chipSelected]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, maxHeight: '90%', paddingBottom: Spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text },
  quickButton: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary },
  // flexShrink, not flex: 1 — content-sized sheet with a maxHeight (see EditBookingModal).
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm },
  empty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
  courtCard: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm },
  courtHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  courtName: { fontSize: FontSize.md, fontFamily: FontFamily.bold, fontWeight: '600', color: Colors.text },
  courtMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  courtEmpty: { fontSize: FontSize.xs, color: Colors.textMuted },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slot: { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '10' },
  slotText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
});
