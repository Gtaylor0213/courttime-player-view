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
import { TimePicker } from '../../src/components/TimePicker';
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
  const [modalStartTime, setModalStartTime] = useState('');
  const [modalEndTime, setModalEndTime] = useState('');
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);

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
    setModalStartTime(slot.startTime.slice(0, 5));
    setModalEndTime(slot.endTime.slice(0, 5));
    setBookingType('match');
    setBookingNotes('');
    setAdditionalCourtIds([]);
    setShowBookingModal(true);
  }

  // ── Handle calendar grid booking selection ──
  function handleCalendarGridSelection(court: Court, startTime: string, endTime: string) {
    setSelectedCourt(court);
    setSelectedSlot({ startTime, endTime, available: true });
    setModalStartTime(startTime.slice(0, 5));
    setModalEndTime(endTime.slice(0, 5));
    setBookingType('match');
    setBookingNotes('');
    setAdditionalCourtIds([]);
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
    if (!selectedCourt || !user || !facilityId) return;

    const startTime = modalStartTime + ':00';
    const endTime = modalEndTime + ':00';

    if (toMinutes(modalEndTime) <= toMinutes(modalStartTime)) {
      showAlert('Invalid Time', 'End time must be after start time.');
      return;
    }

    setBooking(true);

    // Book the primary court
    const allCourtIds = [selectedCourt.id, ...additionalCourtIds];
    let allSuccess = true;
    let firstError: string | null = null;
    let firstViolations: RuleViolation[] | null = null;
    let firstWarnings: RuleViolation[] = [];

    for (const courtId of allCourtIds) {
      const bookingData = {
        courtId,
        facilityId,
        userId: user.id,
        bookingDate: selectedDate,
        startTime,
        endTime,
        durationMinutes: calcDuration(startTime, endTime),
        bookingType,
        notes: bookingNotes.trim() || undefined,
      };

      const res = await api.post('/api/bookings', bookingData);

      if (!res.success) {
        allSuccess = false;
        if (res.ruleViolations && res.ruleViolations.length > 0 && !firstViolations) {
          firstViolations = res.ruleViolations;
          firstWarnings = res.warnings || [];
        } else if (!firstError) {
          firstError = res.error || 'Could not complete booking.';
        }
        break;
      }
    }

    if (allSuccess) {
      setShowBookingModal(false);
      hapticSuccess();
      const courtCount = allCourtIds.length;
      showAlert('Booked!', courtCount > 1 ? `${courtCount} courts reserved.` : 'Your court has been reserved.');
      fetchTimeSlots();
    } else if (firstViolations) {
      hapticError();
      setViolations(firstViolations);
      setWarnings(firstWarnings);
      setShowBookingModal(false);
      setShowViolations(true);
    } else {
      showAlert('Booking Failed', firstError || 'Could not complete booking.');
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

  const toMinutes = (t: string) => {
    const p = t.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1] || '0');
  };

  const fromMinutes = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  // Get available start times (slots that are not booked and not in the past)
  const getAvailableStartTimes = (): string[] => {
    return timeSlots.filter(s => s.available).map(s => s.startTime.slice(0, 5));
  };

  // Get available end times based on selected start time
  // Max end = next booking start time or closing time, whichever comes first
  // Min end = start + 30 min (one slot)
  const getAvailableEndTimes = (startTime: string): string[] => {
    const startMin = toMinutes(startTime);
    const slotDur = timeSlots.length >= 2
      ? toMinutes(timeSlots[1].startTime) - toMinutes(timeSlots[0].startTime)
      : 30;

    // Find closing time (end of last slot)
    const lastSlot = timeSlots[timeSlots.length - 1];
    const closeMin = lastSlot ? toMinutes(lastSlot.endTime) : startMin + 120;

    // Find next booked slot after start
    let maxEnd = closeMin;
    for (const slot of timeSlots) {
      const slotMin = toMinutes(slot.startTime);
      if (slotMin > startMin && !slot.available) {
        maxEnd = slotMin;
        break;
      }
    }

    // Generate end times from start+30 to maxEnd in slotDur increments
    const ends: string[] = [];
    for (let m = startMin + slotDur; m <= maxEnd; m += slotDur) {
      ends.push(fromMinutes(m));
    }
    return ends;
  };

  // Toggle additional court
  const toggleAdditionalCourt = (courtId: string) => {
    setAdditionalCourtIds(prev =>
      prev.includes(courtId) ? prev.filter(id => id !== courtId) : [...prev, courtId]
    );
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
          onPress={() => { setViewMode('list'); setCalendarExpanded(true); }}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? Colors.textInverse : Colors.textSecondary} />
          <Text style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewMode === 'calendar' && styles.viewToggleActive]}
          onPress={() => { setViewMode('calendar'); setCalendarExpanded(false); }}
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
        <Text style={styles.sectionTitle}>Select a Court to Book</Text>
        {courts.length === 0 && facilityId && (
          <View style={styles.emptyCard}>
            <Ionicons name="tennisball-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No courts available</Text>
          </View>
        )}
        {courts.map((court) => (
          <TouchableOpacity
            key={court.id}
            style={styles.courtListCard}
            onPress={async () => {
              setSelectedCourt(court);
              // Fetch availability for this court right now
              const res = await api.get(`/api/court-config/${court.id}/availability?date=${selectedDate}`);
              if (res.success && res.data && res.data.isOpen) {
                const data = res.data;
                const slotDur = data.slotDuration || 30;
                const [openH, openM] = data.operatingHours.open.split(':').map(Number);
                const [closeH, closeM] = data.operatingHours.close.split(':').map(Number);
                const bookedSet = new Set((data.existingBookings || []).map((b: any) => b.startTime));
                const now = new Date();
                const isToday = selectedDate === getTodayString();

                // Build available start times
                const starts: string[] = [];
                let h = openH, m = openM;
                while (h < closeH || (h === closeH && m < closeM)) {
                  const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  const isPast = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()));
                  if (!bookedSet.has(t + ':00') && !isPast) starts.push(t);
                  m += slotDur;
                  if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
                }

                if (starts.length > 0) {
                  const startTime = starts[0];
                  setModalStartTime(startTime);

                  // Build end times for first start
                  const startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
                  const closeMin = closeH * 60 + closeM;
                  let maxEnd = closeMin;
                  // Find next booked slot after start
                  for (const slot of (data.existingBookings || [])) {
                    if (!slot.startTime) continue;
                    const bMin = parseInt(slot.startTime.split(':')[0]) * 60 + parseInt(slot.startTime.split(':')[1]);
                    if (bMin > startMin) { maxEnd = Math.min(maxEnd, bMin); break; }
                  }
                  const firstEnd = Math.min(startMin + slotDur, maxEnd);
                  setModalEndTime(`${String(Math.floor(firstEnd / 60)).padStart(2, '0')}:${String(firstEnd % 60).padStart(2, '0')}`);

                  // Also update timeSlots state so the pickers work
                  const slots: TimeSlot[] = [];
                  h = openH; m = openM;
                  while (h < closeH || (h === closeH && m < closeM)) {
                    const st = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
                    let eM = m + slotDur, eH = h;
                    if (eM >= 60) { eH += Math.floor(eM / 60); eM = eM % 60; }
                    const et = `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;
                    const isPast = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()));
                    slots.push({ startTime: st, endTime: et, available: !bookedSet.has(st) && !isPast });
                    m += slotDur;
                    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
                  }
                  setTimeSlots(slots);
                }
              }
              setBookingType('match');
              setBookingNotes('');
              setAdditionalCourtIds([]);
              setShowBookingModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.courtListIcon}>
              <Ionicons
                name={court.courtType === 'Pickleball' ? 'tennisball' : 'tennisball-outline'}
                size={24}
                color={Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.courtListName}>{court.name}</Text>
              <Text style={styles.courtListMeta}>
                {court.courtType || 'Tennis'} · {court.surfaceType || 'Hard'}{court.hasLights ? ' · Lights' : ''}
              </Text>
            </View>
            <View style={styles.courtListAvail}>
              <Text style={styles.courtListAvailText}>{availableCount} slots</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      </>
      )}

      <View style={{ height: Spacing.xl }} />

      {/* ── Booking Details Modal ── */}
      <Modal visible={showBookingModal} transparent animationType="slide" onRequestClose={() => setShowBookingModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
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
            </View>

            {/* Time Pickers */}
            <Text style={styles.modalLabel}>Select Time</Text>
            <View style={styles.timePickerRow}>
              <TimePicker
                label="Start"
                times={getAvailableStartTimes()}
                selectedTime={modalStartTime}
                onSelect={(t) => {
                  setModalStartTime(t);
                  // Auto-adjust end time if needed
                  const ends = getAvailableEndTimes(t);
                  if (ends.length > 0 && (toMinutes(modalEndTime) <= toMinutes(t) || !ends.includes(modalEndTime))) {
                    setModalEndTime(ends[0]);
                  }
                }}
              />
              <View style={styles.timePickerDivider}>
                <Text style={styles.timePickerDividerText}>to</Text>
              </View>
              <TimePicker
                label="End"
                times={getAvailableEndTimes(modalStartTime)}
                selectedTime={modalEndTime}
                onSelect={setModalEndTime}
              />
            </View>

            {/* Duration display */}
            {modalStartTime && modalEndTime && toMinutes(modalEndTime) > toMinutes(modalStartTime) && (
              <View style={styles.durationBadge}>
                <Ionicons name="time-outline" size={14} color={Colors.primary} />
                <Text style={styles.durationText}>
                  {calcDuration(modalStartTime + ':00', modalEndTime + ':00')} minutes
                </Text>
              </View>
            )}

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

            {/* Additional Courts (Admin only) */}
            {isAdmin && courts.length > 1 && (
              <>
                <Text style={styles.modalLabel}>Additional Courts (Admin)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md }}>
                  {courts.filter(c => c.id !== selectedCourt?.id).map(court => (
                    <TouchableOpacity
                      key={court.id}
                      style={[styles.typeChip, additionalCourtIds.includes(court.id) && styles.typeChipSelected]}
                      onPress={() => toggleAdditionalCourt(court.id)}
                    >
                      <Text style={[styles.typeChipText, additionalCourtIds.includes(court.id) && styles.typeChipTextSelected]}>
                        {court.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

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
                <Text style={styles.confirmButtonText}>
                  {additionalCourtIds.length > 0
                    ? `Book ${1 + additionalCourtIds.length} Courts`
                    : 'Confirm Booking'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={{ height: Spacing.xl }} />
          </ScrollView>
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

  // ── Court List Cards (list view) ──
  courtListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  courtListIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courtListName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  courtListMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  courtListAvail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  courtListAvailText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
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
    maxHeight: '85%',
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
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  timePickerDivider: {
    paddingTop: Spacing.xl + Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  timePickerDividerText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  durationText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
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
