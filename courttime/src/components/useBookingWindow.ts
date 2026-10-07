import { useEffect, useState } from 'react';
import { rulesApi } from '../api/client';
import {
  bookingWindowBlockedMessage,
  cutoffFromWindowInfo,
  endsAfterBookingCutoff,
  formatHourLabel,
  isDateFullyLockedByCutoff,
  lastOpenYmdForCutoff,
  slotStartsAtOrAfterCutoff,
  type BookingWindowInfo,
} from '../../shared/utils/bookingWindow';

/** Milliseconds until just after the next top of the hour, when the cutoff moves. */
function msUntilNextHour(): number {
  return 3600000 - (Date.now() % 3600000) + 2000;
}

/**
 * Days-in-advance window the server enforces for the signed-in member at this facility.
 * Refetches at the top of every hour (the cutoff rolls forward hourly) and when
 * `refreshKey` changes.
 */
export function useBookingWindow(facilityId: string | undefined, refreshKey?: string) {
  const [info, setInfo] = useState<BookingWindowInfo | null>(null);
  const [hourTick, setHourTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setHourTick((t) => t + 1), msUntilNextHour());
    return () => clearTimeout(timer);
  }, [hourTick]);

  useEffect(() => {
    if (!facilityId) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    rulesApi
      .getBookingWindow(facilityId)
      .then((res) => {
        if (cancelled) return;
        const data = res.success ? res.data : undefined;
        setInfo(
          data && typeof data === 'object'
            ? {
                maxDaysAhead: data.maxDaysAhead,
                todayYmd: data.todayYmd,
                cutoffYmd: data.cutoffYmd,
                cutoffTime: data.cutoffTime,
              }
            : null
        );
      })
      .catch(() => {
        // The server still enforces the rule; without the window we just can't warn early.
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityId, refreshKey, hourTick]);

  const cutoff = cutoffFromWindowInfo(info);
  const maxDaysAhead = info?.maxDaysAhead ?? null;

  /** Message when a reservation on ymd from start to end runs past the cutoff, otherwise null. */
  const blockedMessageFor = (ymd: string, startTime: string, endTime: string): string | null =>
    cutoff && maxDaysAhead != null && endsAfterBookingCutoff(ymd, startTime, endTime, cutoff)
      ? bookingWindowBlockedMessage(maxDaysAhead, cutoff)
      : null;

  /** True when a slot starting at startTime ("HH:MM") on ymd can't be booked yet. */
  const isSlotLocked = (ymd: string, startTime: string): boolean =>
    slotStartsAtOrAfterCutoff(ymd, startTime, cutoff);

  /** Banner for a whole day: fully locked, partly open (the cutoff day), or null. */
  const dayNoticeFor = (ymd: string): string | null => {
    if (!cutoff || maxDaysAhead == null) return null;
    if (isDateFullyLockedByCutoff(ymd, cutoff)) {
      return `This date isn't open for booking yet. ${bookingWindowBlockedMessage(maxDaysAhead, cutoff)}`;
    }
    if (ymd === cutoff.cutoffYmd) {
      return `Times on this day open hour by hour. Right now reservations must end by ${formatHourLabel(cutoff.cutoffTime)}; later times unlock each hour.`;
    }
    return null;
  };

  /** Generic "must end by …" message while a limit applies, otherwise null. */
  const cutoffMessage = cutoff && maxDaysAhead != null ? bookingWindowBlockedMessage(maxDaysAhead, cutoff) : null;

  /** Last date with any bookable time, for date-picker max attributes. */
  const lastOpenYmd = cutoff ? lastOpenYmdForCutoff(cutoff) : null;

  return { bookingWindow: info, cutoff, cutoffMessage, blockedMessageFor, isSlotLocked, dayNoticeFor, lastOpenYmd };
}
