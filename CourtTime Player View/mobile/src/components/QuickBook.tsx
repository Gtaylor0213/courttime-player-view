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
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { hapticSuccess, hapticError } from '../utils/haptics';
import { api } from '../api/client';
import { formatLocalDate } from '../utils/dateUtils';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../constants/theme';
import type { Court } from '../types/database';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

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
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonSlotRow}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={styles.skeletonSlotTextCol}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="55%" height={12} style={{ marginTop: Spacing.sm }} />
            </View>
            <Skeleton width={56} height={28} borderRadius={BorderRadius.full} />
          </View>
        ))}
      </View>
    );
  }

  if (slots.length === 0) {
    const emptyByState: Record<
      QuickBookEmptyState,
      { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }
    > = {
      no_courts: {
        icon: 'tennisball-outline',
        title: 'No courts',
        description: 'This club has no bookable courts configured yet.',
      },
      all_booked: {
        icon: 'people-outline',
        title: 'All booked',
        description: 'Every court is reserved for the next available window.',
      },
      outside_open_hours: {
        icon: 'moon-outline',
        title: 'Outside open hours',
        description: 'Courts are closed for now. Check back during operating hours.',
      },
      request_failed: {
        icon: 'cloud-offline-outline',
        title: 'Could not load',
        description: 'Availability could not be refreshed. Check your connection and try again.',
      },
    };
    const cfg = emptyByState[emptyState];
    return (
      <EmptyState
        icon={cfg.icon}
        title={cfg.title}
        description={cfg.description}
        actionLabel={emptyState === 'request_failed' ? 'Retry' : undefined}
        onAction={emptyState === 'request_failed' ? computeSlots : undefined}
      />
    );
  }

  return (
    <View>
      {slots.map((slot) => {
        const slotKey = `${slot.courtId}_${slot.startTime}`;
        const busy = bookingSlotKey === slotKey;
        return (
          <Pressable
            key={slotKey}
            style={({ pressed }) => [
              styles.slot,
              busy && styles.slotBusy,
              pressed && bookingSlotKey === null && styles.pressedOpacity,
            ]}
            onPress={() => confirmAndBook(slot)}
            disabled={bookingSlotKey !== null}
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
          </Pressable>
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
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  skeletonSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
  },
  skeletonSlotTextCol: {
    flex: 1,
  },
  pressedOpacity: {
    opacity: 0.85,
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
    minHeight: TouchTarget.min,
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
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  slotTime: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.bold,
    color: Colors.primary,
  },
});
