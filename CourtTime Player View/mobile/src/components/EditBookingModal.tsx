/**
 * EditBookingModal
 * Lets a player change date, court, start, or end time on an existing booking.
 *
 * Backend has no PATCH endpoint, so we follow the web app's pattern:
 *   1. validate the new slot is free (skip the original booking from conflicts)
 *   2. cancel the old booking
 *   3. create a new booking with the updated details
 * If the create fails after the cancel, we surface the error — the slot is now
 * free so the player can retry from the booking screen.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { hapticSuccess, hapticError } from '../utils/haptics';
import { api } from '../api/client';
import { MiniCalendar } from './MiniCalendar';
import { TimePicker } from './TimePicker';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court, BookingWithDetails } from '../types/database';

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity?: string;
}

interface Props {
  booking: BookingWithDetails | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditBookingModal({ booking, visible, onClose, onSaved }: Props) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [date, setDate] = useState('');
  const [courtId, setCourtId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [availableStarts, setAvailableStarts] = useState<string[]>([]);
  const [availableEnds, setAvailableEnds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState<RuleViolation[]>([]);

  // Pre-fill form when modal opens with a fresh booking
  useEffect(() => {
    if (!booking || !visible) return;
    // bookingDate is typed as Date but the API returns an ISO string over JSON.
    const raw = booking.bookingDate as unknown as string | Date;
    const bookingDate = typeof raw === 'string'
      ? raw.slice(0, 10)
      : new Date(raw).toISOString().slice(0, 10);
    setDate(bookingDate);
    setCourtId(booking.courtId);
    setStartTime(booking.startTime.slice(0, 5));
    setEndTime(booking.endTime.slice(0, 5));
    setViolations([]);
  }, [booking, visible]);

  // Fetch bookable courts at this facility
  useEffect(() => {
    if (!booking || !visible) return;
    api.get(`/api/facilities/${booking.facilityId}/courts`).then(res => {
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.courts || [];
        setCourts(
          list.filter((c: Court) => c.status === 'available' && !c.isWalkUp)
        );
      }
    });
  }, [booking, visible]);

  // Fetch availability whenever date or court changes — exclude the original
  // booking from conflicts so the user can keep the same slot if they only
  // changed e.g. duration.
  useEffect(() => {
    if (!booking || !courtId || !date) return;
    let cancelled = false;
    (async () => {
      const res = await api.get(`/api/court-config/${courtId}/availability?date=${date}`);
      if (cancelled || !res.success || !res.data) return;
      const data = res.data;
      if (!data.isOpen) {
        setAvailableStarts([]);
        return;
      }
      const slotDur = data.slotDuration || 30;
      const [openH, openM] = data.operatingHours.open.split(':').map(Number);
      const [closeH, closeM] = data.operatingHours.close.split(':').map(Number);
      const bookedTimes = new Set(
        (data.existingBookings || [])
          .filter((b: any) => !(b.id === booking.id || b.bookingId === booking.id))
          .map((b: any) => b.startTime)
      );

      const isToday = date === toDateString(new Date());
      const now = new Date();
      const starts: string[] = [];
      let h = openH, m = openM;
      while (h < closeH || (h === closeH && m < closeM)) {
        const t = `${pad(h)}:${pad(m)}`;
        const slotPast = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()));
        if (!bookedTimes.has(`${t}:00`) && !slotPast) starts.push(t);
        m += slotDur;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
      }
      setAvailableStarts(starts);
    })();
    return () => { cancelled = true; };
  }, [booking, courtId, date]);

  // Recompute valid end times based on selected start
  useEffect(() => {
    if (!startTime || availableStarts.length === 0) {
      setAvailableEnds([]);
      return;
    }
    const startMin = toMinutes(startTime);
    const slotDur = availableStarts.length >= 2
      ? toMinutes(availableStarts[1]) - toMinutes(availableStarts[0])
      : 30;

    // Max end = next unavailable slot start, or facility close
    let maxEnd = startMin + 240; // hard cap at 4h
    for (const s of availableStarts) {
      const m = toMinutes(s);
      if (m > startMin) {
        // gap means a booked slot in between → cap at the gap
        if (m !== startMin + slotDur * Math.round((m - startMin) / slotDur)) {
          maxEnd = Math.min(maxEnd, m);
          break;
        }
      }
    }
    // Also, last selectable end is the slot AFTER the last available start
    const lastStart = toMinutes(availableStarts[availableStarts.length - 1]);
    maxEnd = Math.min(maxEnd, lastStart + slotDur);

    const ends: string[] = [];
    for (let m = startMin + slotDur; m <= maxEnd; m += slotDur) {
      ends.push(fromMinutes(m));
    }
    setAvailableEnds(ends);

    // If current end is no longer valid, snap to first valid end
    if (ends.length > 0 && !ends.includes(endTime)) {
      setEndTime(ends[0]);
    }
  }, [startTime, availableStarts]);

  if (!booking) return null;

  async function handleSave() {
    if (!booking) return;
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      showAlert('Invalid Time', 'End time must be after start time.');
      return;
    }

    setSaving(true);
    setViolations([]);

    const startTimeFull = `${startTime}:00`;
    const endTimeFull = `${endTime}:00`;
    const durationMinutes = toMinutes(endTime) - toMinutes(startTime);

    // Cancel the old booking first so it doesn't conflict with the new one
    const cancelRes = await api.delete(`/api/bookings/${booking.id}?userId=${booking.userId}`);
    if (!cancelRes.success) {
      hapticError();
      setSaving(false);
      showAlert('Error', cancelRes.error || 'Could not update booking.');
      return;
    }

    const createRes = await api.post('/api/bookings', {
      courtId,
      facilityId: booking.facilityId,
      userId: booking.userId,
      bookingDate: date,
      startTime: startTimeFull,
      endTime: endTimeFull,
      durationMinutes,
      bookingType: booking.bookingType,
      notes: booking.notes,
    });

    setSaving(false);

    if (createRes.success) {
      hapticSuccess();
      onSaved();
      onClose();
      showAlert('Updated', 'Booking updated successfully.');
    } else {
      hapticError();
      if (createRes.ruleViolations && createRes.ruleViolations.length > 0) {
        setViolations(createRes.ruleViolations as RuleViolation[]);
      } else {
        // Old booking is gone but new one failed. Tell the user clearly so
        // they can retry from the booking screen.
        showAlert(
          'Update Failed',
          (createRes.error || 'Could not create the new booking.') +
            ' Your original booking has been cancelled — please re-book from the Book tab.'
        );
        onSaved();
        onClose();
      }
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit Booking</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Spacing.xl }}>
            {/* Date */}
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity
              style={styles.dateRow}
              onPress={() => setShowCalendar(!showCalendar)}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              <Text style={styles.dateText}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </Text>
              <Ionicons
                name={showCalendar ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
            {showCalendar && (
              <MiniCalendar
                selectedDate={date}
                onSelectDate={(d) => { setDate(d); setShowCalendar(false); }}
                minDate={toDateString(new Date())}
              />
            )}

            {/* Court */}
            <Text style={styles.label}>Court</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {courts.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.courtChip, courtId === c.id && styles.courtChipSelected]}
                    onPress={() => setCourtId(c.id)}
                  >
                    <Text style={[styles.courtChipText, courtId === c.id && styles.courtChipTextSelected]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Times */}
            <Text style={styles.label}>Time</Text>
            {availableStarts.length === 0 ? (
              <View style={styles.unavailable}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
                <Text style={styles.unavailableText}>
                  No times available on this date. Pick another date or court.
                </Text>
              </View>
            ) : (
              <View style={styles.timePickerRow}>
                <TimePicker
                  label="Start"
                  times={availableStarts}
                  selectedTime={startTime}
                  onSelect={setStartTime}
                />
                <View style={styles.timeDivider}>
                  <Text style={styles.timeDividerText}>to</Text>
                </View>
                <TimePicker
                  label="End"
                  times={availableEnds}
                  selectedTime={endTime}
                  onSelect={setEndTime}
                />
              </View>
            )}

            {/* Rule violations */}
            {violations.length > 0 && (
              <View style={styles.violationsBox}>
                <Text style={styles.violationsTitle}>Cannot save — booking violates facility rules:</Text>
                {violations.map((v, i) => (
                  <View key={i} style={styles.violationRow}>
                    <Ionicons name="alert-circle" size={16} color={Colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.violationName}>{v.ruleName}</Text>
                      <Text style={styles.violationMsg}>{v.message}</Text>
                    </View>
                  </View>
                ))}
                <Text style={styles.violationsFooter}>
                  Your original booking has been cancelled — please re-book from the Book tab with valid options.
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, (saving || availableStarts.length === 0 || violations.length > 0) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || availableStarts.length === 0 || violations.length > 0}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── helpers ──
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  label: {
    fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: Spacing.sm,
  },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  dateText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  courtChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  courtChipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  courtChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  courtChipTextSelected: { color: Colors.primary, fontWeight: '600' },
  timePickerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  timeDivider: { paddingTop: Spacing.xl + Spacing.sm, paddingHorizontal: Spacing.sm },
  timeDividerText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  unavailable: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.warning + '12', padding: Spacing.md,
    borderRadius: BorderRadius.md, marginBottom: Spacing.md,
  },
  unavailableText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  violationsBox: {
    backgroundColor: Colors.error + '08', borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.error,
  },
  violationsTitle: {
    fontSize: FontSize.sm, fontWeight: '700', color: Colors.error,
    marginBottom: Spacing.sm,
  },
  violationRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  violationName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  violationMsg: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  violationsFooter: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  saveButton: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '700' },
});
