/**
 * Helpers for the recurring-reservation conflict flow: format the conflicting
 * instances returned by POST /api/bookings/recurring-series and ask the admin
 * whether to book the remaining dates or cancel.
 */
import type { RecurringSeriesConflict } from '../api/client';

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function describeRecurringConflict(c: RecurringSeriesConflict): string {
  const day = new Date(`${c.bookingDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `${c.courtName} on ${day} at ${formatTime12h(c.startTime)}`;
}

/**
 * Show the conflicting dates and ask whether to book the remaining dates.
 * Returns true to proceed (re-submit with skipConflicts) or false to cancel.
 */
export function confirmSkipRecurringConflicts(conflicts: RecurringSeriesConflict[]): boolean {
  const lines = conflicts.map((c) => `• ${describeRecurringConflict(c)}`).join('\n');
  return window.confirm(
    `The following date(s) in this recurring reservation conflict with existing reservations:\n\n${lines}\n\n` +
      `Press OK to book all of the other dates (the conflicting date(s) will be skipped), ` +
      `or Cancel to make no reservations and start over.`
  );
}
