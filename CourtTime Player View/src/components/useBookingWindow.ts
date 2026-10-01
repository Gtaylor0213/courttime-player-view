import { useEffect, useState } from 'react';
import { rulesApi } from '../api/client';
import {
  bookingWindowBlockedMessage,
  isBeyondBookingWindow,
  type BookingWindowInfo,
} from '../../shared/utils/bookingWindow';

/**
 * Days-in-advance window the server enforces for the signed-in member at this facility.
 * `refreshKey` lets callers refetch when the facility's day may have rolled over.
 */
export function useBookingWindow(facilityId: string | undefined, refreshKey?: string) {
  const [info, setInfo] = useState<BookingWindowInfo | null>(null);

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
            ? { maxDaysAhead: data.maxDaysAhead, todayYmd: data.todayYmd, lastBookableYmd: data.lastBookableYmd }
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
  }, [facilityId, refreshKey]);

  /** Message to show when `ymd` is past the window, otherwise null. */
  const blockedMessageFor = (ymd: string): string | null =>
    info?.maxDaysAhead != null && info.lastBookableYmd && isBeyondBookingWindow(ymd, info.lastBookableYmd)
      ? bookingWindowBlockedMessage(info.maxDaysAhead, info.lastBookableYmd)
      : null;

  return { bookingWindow: info, blockedMessageFor };
}
