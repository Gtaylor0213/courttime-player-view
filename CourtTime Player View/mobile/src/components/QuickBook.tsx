/**
 * QuickBook
 * Surfaces the next ~3 available 1-hour slots across all bookable courts at the
 * current facility, so a player can grab the soonest opening with a single tap
 * — without going through the full Book tab flow.
 *
 * Defaults: 1-hour duration, today only, bookingType 'match'. Walk-up and
 * unavailable courts are excluded. Rule-violation responses bubble up via the
 * onRuleViolations callback so the caller can show a violations modal.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { hapticSuccess, hapticError } from '../utils/haptics';
import { api } from '../api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { Court } from '../types/database';

interface QuickSlot {
  courtId: string;
  courtName: string;
  startTime: string; // HH:mm:ss
  endTime: string;   // HH:mm:ss
}

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity?: string;
}

interface Props {
  userId: string;
  facilityId: string;
  refreshKey: number; // bump to force refetch (e.g. after cancel/edit)
  onBooked: () => void;
  onRuleViolations: (violations: RuleViolation[], warnings: RuleViolation[]) => void;
}

const SLOT_DURATION_MIN = 60;
const MAX_SLOTS = 3;

export function QuickBook({ userId, facilityId, refreshKey, onBooked, onRuleViolations }: Props) {
  const [slots, setSlots] = useState<QuickSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSlotKey, setBookingSlotKey] = useState<string | null>(null);

  const computeSlots = useCallback(async () => {
    setLoading(true);
    try {
      const courtsRes = await api.get(`/api/facilities/${facilityId}/courts`);
      if (!courtsRes.success || !courtsRes.data) {
        setSlots([]);
        return;
      }
      const courtList: Court[] = Array.isArray(courtsRes.data)
        ? courtsRes.data
        : courtsRes.data.courts || [];
      const bookable = courtList.filter(
        (c) => c.status === 'available' && !c.isWalkUp
      );
      if (bookable.length === 0) {
        setSlots([]);
        return;
      }

      const today = todayString();
      const availabilityResults = await Promise.all(
        bookable.map((c) =>
          api.get(`/api/court-config/${c.id}/availability?date=${today}`).then(
            (res) => ({ court: c, res })
          )
        )
      );

      const now = new Date();
      const found: QuickSlot[] = [];

      for (const { court, res } of availabilityResults) {
        if (!res.success || !res.data || !res.data.isOpen) continue;
        const data = res.data;
        const slotDur = data.slotDuration || 30;
        const [openH, openM] = data.operatingHours.open.split(':').map(Number);
        const [closeH, closeM] = data.operatingHours.close.split(':').map(Number);
        const bookedTimes = new Set<string>(
          (data.existingBookings || []).map((b: any) => b.startTime)
        );

        let h = openH;
        let m = openM;
        let earliestStart: { h: number; m: number } | null = null;

        while (h < closeH || (h === closeH && m < closeM)) {
          const slotStart = `${pad(h)}:${pad(m)}:00`;
          const slotPast = h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());

          if (!bookedTimes.has(slotStart) && !slotPast) {
            // Need a contiguous run of slots covering SLOT_DURATION_MIN
            const slotsNeeded = Math.ceil(SLOT_DURATION_MIN / slotDur);
            let contiguous = true;
            let checkH = h;
            let checkM = m;
            for (let i = 0; i < slotsNeeded; i++) {
              const checkTime = `${pad(checkH)}:${pad(checkM)}:00`;
              const checkMinutes = checkH * 60 + checkM;
              const closeMinutes = closeH * 60 + closeM;
              if (checkMinutes >= closeMinutes || bookedTimes.has(checkTime)) {
                contiguous = false;
                break;
              }
              checkM += slotDur;
              if (checkM >= 60) {
                checkH += Math.floor(checkM / 60);
                checkM = checkM % 60;
              }
            }
            if (contiguous) {
              earliestStart = { h, m };
              break;
            }
          }

          m += slotDur;
          if (m >= 60) {
            h += Math.floor(m / 60);
            m = m % 60;
          }
        }

        if (earliestStart) {
          const startTime = `${pad(earliestStart.h)}:${pad(earliestStart.m)}:00`;
          const endMinutes = earliestStart.h * 60 + earliestStart.m + SLOT_DURATION_MIN;
          const endH = Math.floor(endMinutes / 60);
          const endM = endMinutes % 60;
          const endTime = `${pad(endH)}:${pad(endM)}:00`;
          found.push({
            courtId: court.id,
            courtName: court.name,
            startTime,
            endTime,
          });
        }
      }

      // Sort by start time, then take the soonest few
      found.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSlots(found.slice(0, MAX_SLOTS));
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    if (!facilityId) {
      setSlots([]);
      setLoading(false);
      return;
    }
    computeSlots();
  }, [facilityId, refreshKey, computeSlots]);

  function confirmAndBook(slot: QuickSlot) {
    showAlert(
      'Quick Book',
      `Book ${slot.courtName} today at ${formatTime(slot.startTime)} for 1 hour?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          onPress: () => bookSlot(slot),
        },
      ]
    );
  }

  async function bookSlot(slot: QuickSlot) {
    const slotKey = `${slot.courtId}_${slot.startTime}`;
    setBookingSlotKey(slotKey);
    const res = await api.post('/api/bookings', {
      courtId: slot.courtId,
      facilityId,
      userId,
      bookingDate: todayString(),
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: SLOT_DURATION_MIN,
      bookingType: 'match',
    });
    setBookingSlotKey(null);

    if (res.success) {
      hapticSuccess();
      showAlert('Booked!', `${slot.courtName} reserved for ${formatTime(slot.startTime)}.`);
      onBooked();
      computeSlots();
      return;
    }

    hapticError();
    if (res.ruleViolations && res.ruleViolations.length > 0) {
      onRuleViolations(res.ruleViolations as RuleViolation[], (res.warnings || []) as RuleViolation[]);
    } else {
      showAlert('Could not book', res.error || 'Slot may have just been taken. Refreshing.');
      computeSlots();
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (slots.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
        <Text style={styles.emptyText}>No open 1-hour slots today.</Text>
      </View>
    );
  }

  return (
    <View>
      {slots.map((slot) => {
        const slotKey = `${slot.courtId}_${slot.startTime}`;
        const busy = bookingSlotKey === slotKey;
        return (
          <TouchableOpacity
            key={slotKey}
            style={[styles.slot, busy && styles.slotBusy]}
            onPress={() => confirmAndBook(slot)}
            disabled={bookingSlotKey !== null}
            activeOpacity={0.7}
          >
            <View style={styles.slotIcon}>
              <Ionicons name="flash" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slotCourt}>{slot.courtName}</Text>
              <Text style={styles.slotTime}>
                {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <View style={styles.slotCta}>
                <Text style={styles.slotCtaText}>Book</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── helpers ──
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

const styles = StyleSheet.create({
  loadingBox: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyBox: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    gap: Spacing.md,
  },
  slotBusy: {
    opacity: 0.6,
  },
  slotIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotCourt: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  slotTime: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  slotCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  slotCtaText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
  },
});
