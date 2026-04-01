/**
 * Book Court Tab
 * Calendar date picker → court selector → time slot grid → booking details → confirm
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
import { hapticSuccess, hapticError } from '../../src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { MiniCalendar } from '../../src/components/MiniCalendar';
import { FacilitySelector } from '../../src/components/FacilitySelector';
import { CourtCalendarGrid } from '../../src/components/CourtCalendarGrid';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { Court } from '../../src/types/database';

const BOOKING_TYPES = [
  { key: 'match', label: 'Match' },
  { key: 'league_match', label: 'League Match' },
  { key: 't2_match', label: 'T2 Match' },
  { key: 'lesson', label: 'Lesson' },
  { key: 'ball_machine', label: 'Ball Machine' },
  { key: 'individual_practice', label: 'Practice' },
  { key: 'other', label: 'Other' },
];

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

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: string;
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
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Booking details modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingType, setBookingType] = useState('match');
  const [bookingNotes, setBookingNotes] = useState('');

  // Rule violations modal state
  const [showViolations, setShowViolations] = useState(false);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [warnings, setWarnings] = useState<RuleViolation[]>([]);

  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;

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
    setSelectedCourt(null);
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

  // ── Open booking details modal ──
  function handleSlotPress(slot: TimeSlot) {
    setSelectedSlot(slot);
    setBookingType('match');
    setBookingNotes('');
    setShowBookingModal(true);
  }

  // ── Handle calendar grid booking selection ──
  function handleCalendarGridSelection(court: Court, startTime: string, endTime: string) {
    setSelectedCourt(court);
    setSelectedSlot({ startTime, endTime, available: true });
    setBookingType('match');
    setBookingNotes('');
    setShowBookingModal(true);
  }

  // ── Calculate duration ──
  function calcDuration(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }

  // ── Submit booking ──
  async function handleConfirmBooking() {
    if (!selectedCourt || !user || !facilityId || !selectedSlot) return;

    setBooking(true);

    const bookingData = {
      courtId: selectedCourt.id,
      facilityId,
      userId: user.id,
      bookingDate: selectedDate,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      durationMinutes: calcDuration(selectedSlot.startTime, selectedSlot.endTime),
      bookingType,
      notes: bookingNotes.trim() || undefined,
    };

    const res = await api.post('/api/bookings', bookingData);

    if (res.success) {
      setShowBookingModal(false);
      hapticSuccess();
      showAlert('Booked!', 'Your court has been reserved.');
      fetchTimeSlots();
    } else if (res.ruleViolations && res.ruleViolations.length > 0) {
      hapticError();
      // Rule violations — show them
      setViolations(res.ruleViolations);
      setWarnings(res.warnings || []);
      setShowBookingModal(false);
      setShowViolations(true);
    } else {
      showAlert('Booking Failed', res.error || 'Could not complete booking.');
    }
    setBooking(false);
  }

  // ── Admin override booking ──
  async function handleAdminOverride() {
    if (!selectedCourt || !user || !facilityId || !selectedSlot) return;

    setBooking(true);

    const res = await api.post('/api/bookings/admin-override', {
      courtId: selectedCourt.id,
      facilityId,
      userId: user.id,
      bookingDate: selectedDate,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      durationMinutes: calcDuration(selectedSlot.startTime, selectedSlot.endTime),
      bookingType,
      notes: bookingNotes.trim() || undefined,
      overriddenBy: user.id,
      overrideReason: 'Admin override from mobile app',
      overrideRules: violations.map(v => v.ruleCode),
    });

    setShowViolations(false);
    if (res.success) {
      hapticSuccess();
      showAlert('Booked!', 'Booking created with admin override.');
      fetchTimeSlots();
    } else {
      showAlert('Override Failed', res.error || 'Could not complete booking.');
    }
    setBooking(false);
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
            You are not a member of any facility yet. Join a facility from your Profile.
          </Text>
        </View>
      )}

      {/* Facility Selector */}
      <View style={{ marginTop: Spacing.sm }}>
        <FacilitySelector />
      </View>

      {/* View Mode Toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
          onPress={() => setViewMode('list')}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? Colors.textInverse : Colors.textSecondary} />
          <Text style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewMode === 'calendar' && styles.viewToggleActive]}
          onPress={() => setViewMode('calendar')}
        >
          <Ionicons name="grid" size={16} color={viewMode === 'calendar' ? Colors.textInverse : Colors.textSecondary} />
          <Text style={[styles.viewToggleText, viewMode === 'calendar' && styles.viewToggleTextActive]}>Calendar</Text>
        </TouchableOpacity>
      </View>

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

      {/* ══════ CALENDAR GRID VIEW ══════ */}
      {viewMode === 'calendar' && facilityId && (
        <CourtCalendarGrid
          courts={courts}
          selectedDate={selectedDate}
          facilityId={facilityId}
          onBookingSelected={handleCalendarGridSelection}
        />
      )}

      {/* ══════ LIST VIEW ══════ */}
      {viewMode === 'list' && (
      <>
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
                  onPress={() => slot.available && handleSlotPress(slot)}
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
      </>
      )}

      <View style={{ height: Spacing.xl }} />

      {/* ── Booking Details Modal ── */}
      <Modal visible={showBookingModal} transparent animationType="slide" onRequestClose={() => setShowBookingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Booking Details</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.modalSummary}>
              <Text style={styles.summaryCourtName}>{selectedCourt?.name}</Text>
              <Text style={styles.summaryDate}>{selectedDateLabel}</Text>
              <Text style={styles.summaryTime}>
                {selectedSlot && `${formatTime(selectedSlot.startTime)} – ${formatTime(selectedSlot.endTime)}`}
              </Text>
            </View>

            {/* Booking Type */}
            <Text style={styles.modalLabel}>Booking Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {BOOKING_TYPES.map(bt => (
                  <TouchableOpacity
                    key={bt.key}
                    style={[styles.typeChip, bookingType === bt.key && styles.typeChipSelected]}
                    onPress={() => setBookingType(bt.key)}
                  >
                    <Text style={[styles.typeChipText, bookingType === bt.key && styles.typeChipTextSelected]}>
                      {bt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Notes */}
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={bookingNotes}
              onChangeText={setBookingNotes}
              placeholder="Special requests or notes..."
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={200}
            />

            {/* Confirm Button */}
            <TouchableOpacity
              style={[styles.confirmButton, booking && { opacity: 0.6 }]}
              onPress={handleConfirmBooking}
              disabled={booking}
            >
              {booking ? (
                <ActivityIndicator size="small" color={Colors.textInverse} />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm Booking</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Rule Violations Modal ── */}
      <Modal visible={showViolations} transparent animationType="fade" onRequestClose={() => setShowViolations(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.error }]}>Booking Not Allowed</Text>
              <TouchableOpacity onPress={() => setShowViolations(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.violationSubtitle}>
              This booking violates the following facility rules:
            </Text>

            <ScrollView style={{ maxHeight: 250 }}>
              {violations.map((v, i) => (
                <View key={i} style={styles.violationCard}>
                  <Ionicons name="alert-circle" size={20} color={Colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.violationRuleName}>{v.ruleName}</Text>
                    <Text style={styles.violationMessage}>{v.message}</Text>
                  </View>
                </View>
              ))}
              {warnings.length > 0 && (
                <>
                  <Text style={[styles.violationSubtitle, { marginTop: Spacing.md }]}>Warnings:</Text>
                  {warnings.map((w, i) => (
                    <View key={`w-${i}`} style={[styles.violationCard, { borderLeftColor: Colors.warning }]}>
                      <Ionicons name="warning" size={20} color={Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.violationRuleName}>{w.ruleName}</Text>
                        <Text style={styles.violationMessage}>{w.message}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: Colors.textSecondary }]}
              onPress={() => setShowViolations(false)}
            >
              <Text style={styles.confirmButtonText}>Dismiss</Text>
            </TouchableOpacity>

            {/* Admin Override */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: Colors.warning, marginTop: Spacing.sm }]}
                onPress={handleAdminOverride}
                disabled={booking}
              >
                {booking ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.confirmButtonText}>Override as Admin</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  // ── View Toggle ──
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  viewToggleActive: {
    backgroundColor: Colors.primary,
  },
  viewToggleText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  viewToggleTextActive: {
    color: Colors.textInverse,
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

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSummary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  summaryCourtName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  summaryDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  summaryTime: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  modalLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: Spacing.sm,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipSelected: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  typeChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  typeChipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // ── Rule Violations ──
  violationSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  violationCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.error + '08',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
    marginBottom: Spacing.sm,
  },
  violationRuleName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  violationMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
});
