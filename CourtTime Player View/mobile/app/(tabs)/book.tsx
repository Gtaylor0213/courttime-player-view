/**
 * Book Court Tab
 * Calendar date picker → court selector → time slot grid → confirm booking
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { MiniCalendar } from '../../src/components/MiniCalendar';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { Court } from '../../src/types/database';

interface AvailabilityResponse {
  date: string;
  isOpen: boolean;
  operatingHours: { open: string; close: string };
  slotDuration: number;
  existingBookings: Array<{ startTime: string; endTime: string }>;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export default function BookCourtScreen() {
  const { user, facilityId } = useAuth();
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(true);

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Fetch courts ──
  const fetchCourts = useCallback(async () => {
    if (!facilityId) return;
    const res = await api.get(`/api/facilities/${facilityId}/courts`);
    if (res.success && res.data) {
      const courtList = Array.isArray(res.data) ? res.data : res.data.courts || [];
      setCourts(courtList.filter((c: Court) => c.status === 'available'));
    }
  }, [facilityId]);

  // ── Fetch time slots ──
  const fetchTimeSlots = useCallback(async () => {
    if (!selectedCourt) {
      setTimeSlots([]);
      return;
    }

    const res = await api.get(
      `/api/court-config/${selectedCourt.id}/availability?date=${selectedDate}`
    );

    if (res.success && res.data) {
      const data = res.data as AvailabilityResponse;

      if (!data.isOpen) {
        setTimeSlots([]);
        return;
      }

      const slots: TimeSlot[] = [];
      const slotDuration = data.slotDuration || 30;
      const [openH, openM] = data.operatingHours.open.split(':').map(Number);
      const [closeH, closeM] = data.operatingHours.close.split(':').map(Number);
      const bookedTimes = new Set(
        (data.existingBookings || []).map((b) => b.startTime)
      );

      let currentH = openH;
      let currentM = openM;

      while (currentH < closeH || (currentH === closeH && currentM < closeM)) {
        const startTime = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}:00`;

        let endM = currentM + slotDuration;
        let endH = currentH;
        if (endM >= 60) {
          endH += Math.floor(endM / 60);
          endM = endM % 60;
        }
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

        const now = new Date();
        const isToday = selectedDate === getTodayString();
        const slotPast = isToday && (currentH < now.getHours() || (currentH === now.getHours() && currentM <= now.getMinutes()));

        slots.push({
          startTime,
          endTime,
          available: !bookedTimes.has(startTime) && !slotPast,
        });

        currentM += slotDuration;
        if (currentM >= 60) {
          currentH += Math.floor(currentM / 60);
          currentM = currentM % 60;
        }
      }

      setTimeSlots(slots);
    }
  }, [selectedCourt, selectedDate]);

  useEffect(() => {
    fetchCourts();
  }, [fetchCourts]);

  useEffect(() => {
    fetchTimeSlots();
  }, [fetchTimeSlots]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCourts();
    await fetchTimeSlots();
    setRefreshing(false);
  }, [fetchCourts, fetchTimeSlots]);

  // ── Book a slot ──
  async function handleBook(slot: TimeSlot) {
    if (!selectedCourt || !user || !facilityId) return;

    const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    showAlert(
      'Confirm Booking',
      `${selectedCourt.name}\n${dateLabel}\n${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          onPress: async () => {
            setBooking(true);
            const res = await api.post('/api/bookings', {
              courtId: selectedCourt.id,
              facilityId,
              userId: user.id,
              bookingDate: selectedDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });

            if (res.success) {
              showAlert('Booked!', 'Your court has been reserved.');
              fetchTimeSlots();
            } else {
              showAlert('Booking Failed', res.error || 'Could not complete booking.');
            }
            setBooking(false);
          },
        },
      ]
    );
  }

  // ── Helpers ──
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const selectedDateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const availableCount = timeSlots.filter(s => s.available).length;
  const totalCount = timeSlots.length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {!facilityId && (
        <View style={styles.noFacility}>
          <Ionicons name="warning-outline" size={20} color={Colors.warning} />
          <Text style={styles.noFacilityText}>
            You are not a member of any facility yet. Join a facility through the web app.
          </Text>
        </View>
      )}

      {/* ── Calendar ── */}
      <View style={styles.calendarSection}>
        <TouchableOpacity
          style={styles.calendarToggle}
          onPress={() => setCalendarExpanded(!calendarExpanded)}
        >
          <Ionicons name="calendar" size={18} color={Colors.primary} />
          <Text style={styles.calendarToggleText}>{selectedDateLabel}</Text>
          <Ionicons
            name={calendarExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textMuted}
          />
        </TouchableOpacity>

        {calendarExpanded && (
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setCalendarExpanded(false);
            }}
            minDate={getTodayString()}
          />
        )}
      </View>

      {/* ── Court Selector ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Court</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courtScroll}>
          {courts.map((court) => (
            <TouchableOpacity
              key={court.id}
              style={[
                styles.courtChip,
                selectedCourt?.id === court.id && styles.courtChipActive,
              ]}
              onPress={() => setSelectedCourt(court)}
            >
              <Ionicons
                name={court.courtType === 'Pickleball' ? 'tennisball' : 'tennisball-outline'}
                size={16}
                color={selectedCourt?.id === court.id ? Colors.textInverse : Colors.primary}
              />
              <Text style={[
                styles.courtChipText,
                selectedCourt?.id === court.id && styles.courtChipTextActive,
              ]}>
                {court.name}
              </Text>
              <Text style={[
                styles.courtChipMeta,
                selectedCourt?.id === court.id && styles.courtChipMetaActive,
              ]}>
                {court.courtType || 'Tennis'}
              </Text>
            </TouchableOpacity>
          ))}
          {courts.length === 0 && facilityId && (
            <Text style={styles.emptyText}>No courts available</Text>
          )}
        </ScrollView>
      </View>

      {/* ── Time Slots ── */}
      {selectedCourt && (
        <View style={styles.section}>
          <View style={styles.slotHeader}>
            <Text style={styles.sectionTitle}>Available Times</Text>
            {totalCount > 0 && (
              <Text style={styles.slotCount}>
                {availableCount} of {totalCount} available
              </Text>
            )}
          </View>

          {timeSlots.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                No time slots available for this date
              </Text>
            </View>
          ) : (
            <View style={styles.slotGrid}>
              {timeSlots.map((slot, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.slotCard,
                    !slot.available && styles.slotUnavailable,
                  ]}
                  onPress={() => slot.available && handleBook(slot)}
                  disabled={!slot.available || booking}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.slotTime,
                    !slot.available && styles.slotTimeUnavailable,
                  ]}>
                    {formatTime(slot.startTime)}
                  </Text>
                  <Text style={[
                    styles.slotEndTime,
                    !slot.available && styles.slotTimeUnavailable,
                  ]}>
                    {formatTime(slot.endTime)}
                  </Text>
                  {slot.available ? (
                    <View style={styles.slotAvailableDot} />
                  ) : (
                    <Ionicons name="close" size={12} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Prompt to select court */}
      {!selectedCourt && courts.length > 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="arrow-up" size={24} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Select a court above to see available times</Text>
        </View>
      )}

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  noFacility: {
    flexDirection: 'row',
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.warning + '15',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  noFacilityText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },

  // ── Calendar ──
  calendarSection: {
    backgroundColor: Colors.card,
    marginBottom: Spacing.sm,
  },
  calendarToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  calendarToggleText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  calendar: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },

  // ── Courts ──
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  courtScroll: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  courtChip: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 4,
    minWidth: 90,
  },
  courtChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  courtChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  courtChipTextActive: {
    color: Colors.textInverse,
  },
  courtChipMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  courtChipMetaActive: {
    color: Colors.textInverse + 'cc',
  },

  // ── Time Slots ──
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  slotCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  slotCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    width: '30%' as any,
    minWidth: 95,
  },
  slotUnavailable: {
    backgroundColor: Colors.borderLight,
    borderColor: Colors.border,
    opacity: 0.6,
  },
  slotTime: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  slotEndTime: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  slotTimeUnavailable: {
    color: Colors.textMuted,
  },
  slotAvailableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginTop: 4,
  },

  // ── Empty States ──
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.md,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
