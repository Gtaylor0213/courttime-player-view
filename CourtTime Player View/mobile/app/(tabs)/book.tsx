/**
 * Book Court Tab
 * Browse available courts and create bookings
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { Court, Facility } from '../../src/types/database';

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export default function BookCourtScreen() {
  const { user } = useAuth();
  const [courts, setCourts] = useState<Court[]>([]);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [booking, setBooking] = useState(false);

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Get the next 7 days for date selection
  function getDateOptions() {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        isToday: i === 0,
      });
    }
    return dates;
  }

  const fetchCourts = useCallback(async () => {
    const res = await api.get('/api/courts');
    if (res.success && res.data) {
      const courtList = Array.isArray(res.data) ? res.data : res.data.courts || [];
      setCourts(courtList.filter((c: Court) => c.status === 'available'));
    }

    const facRes = await api.get('/api/facilities');
    if (facRes.success && facRes.data) {
      const facilities = Array.isArray(facRes.data) ? facRes.data : facRes.data.facilities || [];
      if (facilities.length > 0) setFacility(facilities[0]);
    }
  }, []);

  const fetchTimeSlots = useCallback(async () => {
    if (!selectedCourt) {
      setTimeSlots([]);
      return;
    }

    const res = await api.get(
      `/api/courts/${selectedCourt.id}/availability?date=${selectedDate}`
    );

    if (res.success && res.data) {
      const slots = Array.isArray(res.data) ? res.data : res.data.slots || res.data.timeSlots || [];
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

  async function handleBook(slot: TimeSlot) {
    if (!selectedCourt || !user || !facility) return;

    Alert.alert(
      'Confirm Booking',
      `Book ${selectedCourt.name} on ${selectedDate}\n${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          onPress: async () => {
            setBooking(true);
            const res = await api.post('/api/bookings', {
              courtId: selectedCourt.id,
              facilityId: facility.id,
              userId: user.id,
              bookingDate: selectedDate,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });

            if (res.success) {
              Alert.alert('Booked!', 'Your court has been reserved.');
              fetchTimeSlots(); // refresh availability
            } else {
              Alert.alert('Booking Failed', res.error || 'Could not complete booking.');
            }
            setBooking(false);
          },
        },
      ]
    );
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  const dateOptions = getDateOptions();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Date Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {dateOptions.map((date) => (
            <TouchableOpacity
              key={date.value}
              style={[
                styles.dateChip,
                selectedDate === date.value && styles.dateChipActive,
              ]}
              onPress={() => setSelectedDate(date.value)}
            >
              <Text
                style={[
                  styles.dateChipText,
                  selectedDate === date.value && styles.dateChipTextActive,
                ]}
              >
                {date.isToday ? 'Today' : date.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Court Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Court</Text>
        <View style={styles.courtGrid}>
          {courts.map((court) => (
            <TouchableOpacity
              key={court.id}
              style={[
                styles.courtCard,
                selectedCourt?.id === court.id && styles.courtCardActive,
              ]}
              onPress={() => setSelectedCourt(court)}
            >
              <Text
                style={[
                  styles.courtName,
                  selectedCourt?.id === court.id && styles.courtNameActive,
                ]}
              >
                {court.name}
              </Text>
              <Text style={styles.courtMeta}>
                {court.surfaceType || 'Hard'} · {court.isIndoor ? 'Indoor' : 'Outdoor'}
              </Text>
            </TouchableOpacity>
          ))}
          {courts.length === 0 && (
            <Text style={styles.emptyText}>No courts available</Text>
          )}
        </View>
      </View>

      {/* Time Slots */}
      {selectedCourt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Times</Text>
          <View style={styles.slotGrid}>
            {timeSlots.length === 0 ? (
              <Text style={styles.emptyText}>
                No time slots available for this date
              </Text>
            ) : (
              timeSlots.map((slot, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.slotChip,
                    !slot.available && styles.slotUnavailable,
                  ]}
                  onPress={() => slot.available && handleBook(slot)}
                  disabled={!slot.available || booking}
                >
                  <Text
                    style={[
                      styles.slotText,
                      !slot.available && styles.slotTextUnavailable,
                    ]}
                  >
                    {formatTime(slot.startTime)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
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
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  dateScroll: {
    flexDirection: 'row',
  },
  dateChip: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dateChipText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: Colors.textInverse,
  },
  courtGrid: {
    gap: Spacing.sm,
  },
  courtCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  courtCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  courtName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  courtNameActive: {
    color: Colors.primary,
  },
  courtMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  slotChip: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  slotUnavailable: {
    backgroundColor: Colors.borderLight,
    borderColor: Colors.border,
  },
  slotText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  slotTextUnavailable: {
    color: Colors.textMuted,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    padding: Spacing.md,
  },
});
