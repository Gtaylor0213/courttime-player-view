import { bookingApi } from '../api/client';

export type PeakHoursWarning = {
  ruleCode: string;
  ruleName: string;
  message: string;
};

export type PeakHoursCheckResult = {
  isPrimeTime: boolean;
  warnings: PeakHoursWarning[];
};

/** Convert 12-hour time (e.g. "6:00 PM") to HH:MM:SS for the API. */
export function to24HourTime(time12h: string): string {
  const [t, period] = time12h.split(' ');
  let [hours, minutes] = t.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`;
}

/**
 * Ask the rules engine whether a draft booking falls in peak hours (no booking created).
 */
export async function checkBookingPeakHours(params: {
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime12h: string;
  endTime12h: string;
}): Promise<PeakHoursCheckResult> {
  const empty: PeakHoursCheckResult = { isPrimeTime: false, warnings: [] };
  const { courtId, userId, facilityId, bookingDate, startTime12h, endTime12h } = params;
  if (!courtId || !userId || !facilityId || !bookingDate || !startTime12h || !endTime12h) {
    return empty;
  }

  const startTime = to24HourTime(startTime12h);
  const endTime = to24HourTime(endTime12h);
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const durationMinutes = eh * 60 + em - (sh * 60 + sm);
  if (durationMinutes <= 0) return empty;

  try {
    const res = await bookingApi.validate({
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
    });
    if (!res.success) return empty;

    const payload = res.data as { validation?: Record<string, unknown> } | Record<string, unknown> | undefined;
    const validation = (payload && 'validation' in payload ? payload.validation : payload) as
      | { isPrimeTime?: boolean; warnings?: Array<Record<string, unknown>> }
      | undefined;
    if (!validation) return empty;

    const warnings = Array.isArray(validation.warnings)
      ? validation.warnings.map((w) => ({
          ruleCode: String(w.ruleCode ?? ''),
          ruleName: String(w.ruleName ?? ''),
          message: String(w.message ?? ''),
        }))
      : [];

    return {
      isPrimeTime: Boolean(validation.isPrimeTime),
      warnings,
    };
  } catch {
    return empty;
  }
}
