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
import { formatLocalDate } from '../utils/dateUtils';
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

type QuickBookEmptyState = 'no_courts' | 'all_booked' | 'outside_open_hours' | 'request_failed';

export function QuickBook({ userId, facilityId, refreshKey, onBooked, onRuleViolations }: Props) {
  const [slots, setSlots] = useState<QuickSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSlotKey, setBookingSlotKey] = useState<string | null>(null);
  const [emptyState, setEmptyState] = useState<QuickBookEmptyState>('all_booked');

  const computeSlots = useCallback(async () => {
    setLoading(true);
    try {
      const courtsRes = await api.get(`/api/facilities/${facilityId}/courts`);
      if (!courtsRes.success || !courtsRes.data) {
        setSlots([]);
        setEmptyState('request_failed');
        return;
      }
      const courtList: Court[] = Array.isArray(courtsRes.data)
        ? courtsRes.data
        : courtsRes.data.courts || [];
      const bookable = courtList.filter(
        (c) => {
          const status = String(c.status || '').toLowerCase();
          return (status === 'available' || status === 'active') && !c.isWalkUp;
        }
      );
      if (bookable.length === 0) {
        setSlots([]);
        setEmptyState('no_courts');
        return;
      }

      const today = formatLocalDate(new Date());
      const bookingsUrl = `/api/bookings/facility/${facilityId}?date=${today}`;
      const configUrl = `/api/court-config/facility/${facilityId}?date=${today}`;
      if (__DEV__) {
        console.log('[quick-book] loading availability', {
          facilityId,
          bookingsUrl,
          configUrl,
          courtsUrl: `/api/facilities/${facilityId}/courts`,
        });
      }

      const [bookingsRes, configRes] = await Promise.all([
        api.get(bookingsUrl),
        api.get(configUrl),
      ]);

      if (!bookingsRes.success || !configRes.success) {
        if (__DEV__) {
          console.log('[quick-book] availability request failed', {
            bookingsSuccess: bookingsRes.success,
            bookingsError: bookingsRes.error,
            configSuccess: configRes.success,
            configError: configRes.error,
          });
        }
        setSlots([]);
        setEmptyState('request_failed');
        return;
      }

      const configList = Array.isArray((configRes.data as any)?.courtConfigs)
        ? (configRes.data as any).courtConfigs
        : [];
      const configByCourtId = new Map<string, any>();
      configList.forEach((cfg: any) => configByCourtId.set(cfg.courtId, cfg));

      const bookingsList = Array.isArray((bookingsRes.data as any)?.bookings)
        ? (bookingsRes.data as any).bookings
        : [];
      const bookedByCourtId = new Map<string, Set<string>>();
      bookingsList.forEach((booking: any) => {
        const courtId = booking.courtId || booking.court_id;
        const startTime = normalizeTimeWithSeconds(booking.startTime || booking.start_time || '');
        if (!courtId || !startTime) return;
        const existing = bookedByCourtId.get(courtId) || new Set<string>();
        existing.add(startTime);
        bookedByCourtId.set(courtId, existing);
      });

      const nowMinutes = getNowMinutes();
      const found: QuickSlot[] = [];
      let hasAnyOpenCourtNow = false;

      for (const court of bookable) {
        const cfg = configByCourtId.get(court.id);
        const isOpen = cfg ? Boolean(cfg.isOpen) : true;
        const openMinutes = parseTimeToMinutes(cfg?.openTime || '06:00');
        const closeMinutes = parseTimeToMinutes(cfg?.closeTime || '22:00');
        const slotDur = Math.max(15, Number(cfg?.slotDuration || 30));
        const bookedTimes = bookedByCourtId.get(court.id) || new Set<string>();

        const currentlyOpen =
          isOpen &&
          openMinutes !== null &&
          closeMinutes !== null &&
          nowMinutes >= openMinutes &&
          nowMinutes < closeMinutes;
        if (currentlyOpen) {
          hasAnyOpenCourtNow = true;
        }

        if (!isOpen || openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
          continue;
        }

        const earliestStartMinutes = roundUpToStep(Math.max(openMinutes, nowMinutes + 1), slotDur);
        const slotsNeeded = Math.ceil(SLOT_DURATION_MIN / slotDur);
        let startMinutes = earliestStartMinutes;
        let earliestStart: number | null = null;

        while (startMinutes + SLOT_DURATION_MIN <= closeMinutes) {
          let contiguous = true;
          for (let i = 0; i < slotsNeeded; i++) {
            const checkMinutes = startMinutes + i * slotDur;
            if (checkMinutes >= closeMinutes) {
              contiguous = false;
              break;
            }
            if (bookedTimes.has(minutesToHHMMSS(checkMinutes))) {
              contiguous = false;
              break;
            }
          }
          if (contiguous) {
            earliestStart = startMinutes;
            break;
          }
          startMinutes += slotDur;
        }

        if (earliestStart !== null) {
          found.push({
            courtId: court.id,
            courtName: court.name,
            startTime: minutesToHHMMSS(earliestStart),
            endTime: minutesToHHMMSS(earliestStart + SLOT_DURATION_MIN),
          });
        }
      }

      found.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const nextSlots = found.slice(0, MAX_SLOTS);
      setSlots(nextSlots);
      if (nextSlots.length > 0) {
        setEmptyState('all_booked');
      } else {
        setEmptyState(hasAnyOpenCourtNow ? 'all_booked' : 'outside_open_hours');
      }
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    if (!facilityId) {
      setSlots([]);
      setEmptyState('no_courts');
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
      bookingDate: formatLocalDate(new Date()),
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
    const messageByState: Record<QuickBookEmptyState, string> = {
      no_courts: 'No courts at this club.',
      all_booked: 'All courts are booked right now.',
      outside_open_hours: 'Outside open hours.',
      request_failed: "Couldn't load availability.",
    };
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
        <Text style={styles.emptyText}>{messageByState[emptyState]}</Text>
        {emptyState === 'request_failed' && (
          <TouchableOpacity style={styles.retryButton} onPress={computeSlots}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
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
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
}

function parseTimeToMinutes(value: string): number | null {
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return parts[0] * 60 + parts[1];
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function roundUpToStep(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

function minutesToHHMMSS(totalMinutes: number): string {
  const minutesInDay = 24 * 60;
  const normalized = ((Math.floor(totalMinutes) % minutesInDay) + minutesInDay) % minutesInDay;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${pad(h)}:${pad(m)}:00`;
}

function normalizeTimeWithSeconds(value: string): string | null {
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return `${pad(h)}:${pad(m)}:00`;
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
    flexWrap: 'wrap',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  retryButton: {
    marginLeft: 'auto',
    backgroundColor: Colors.primary + '14',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  retryButtonText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
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
