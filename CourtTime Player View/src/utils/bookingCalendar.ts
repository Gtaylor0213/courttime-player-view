import { toast } from 'sonner';
import { bookingApi } from '../api/client';
import {
  type BookingCalendarDetails,
  bookingWithDetailsToCalendarDetails,
  buildGoogleCalendarUrl,
  buildIcsEventContent,
  buildIcsFilename,
  formatBookingDateYmd,
  getBookingCalendarIcsPath,
  isAppleCalendarDevice,
} from '../../shared/utils/bookingCalendar';

export type { BookingCalendarDetails };
export {
  bookingWithDetailsToCalendarDetails,
  formatBookingDateYmd,
  isAppleCalendarDevice,
};

type CalendarFeedbackOptions = {
  successTitle?: string;
  bookingConfirmed?: boolean;
  bookingId?: string;
};

/** Opens Google Calendar in a new tab with the event form pre-filled (no file download). */
export function openGoogleCalendar(
  details: BookingCalendarDetails,
  options?: { successTitle?: string }
): boolean {
  try {
    const url = buildGoogleCalendarUrl(details);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.assign(url);
    }
    toast.success(options?.successTitle || 'Opening Google Calendar', {
      description: 'Click Save in Google Calendar to add this court reservation.',
      duration: 7000,
    });
    return true;
  } catch {
    toast.error('Could not open Google Calendar', {
      description: 'Allow pop-ups for this site and try again.',
    });
    return false;
  }
}

function openIcsInline(content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Opens Apple Calendar (Calendar.app) via inline ICS — not Downloads. */
export function openAppleCalendar(
  details: BookingCalendarDetails,
  options?: CalendarFeedbackOptions
): boolean {
  try {
    if (options?.bookingId) {
      window.location.assign(getBookingCalendarIcsPath(options.bookingId));
    } else {
      openIcsInline(buildIcsEventContent(details));
    }
    toast.success(options?.successTitle || 'Opening Apple Calendar', {
      description: 'Confirm the event in Calendar to add your court reservation.',
      duration: 7000,
    });
    return true;
  } catch {
    toast.error('Could not open Apple Calendar', {
      description: 'Try Google Calendar instead, or download a calendar file.',
    });
    return false;
  }
}

/** @deprecated Prefer openGoogleCalendar or openAppleCalendar explicitly. */
export function addBookingToCalendarWithFeedback(
  details: BookingCalendarDetails,
  options?: CalendarFeedbackOptions & { provider?: 'google' | 'apple' }
): boolean {
  if (options?.provider === 'google') {
    return openGoogleCalendar(details, { successTitle: options.successTitle });
  }
  if (options?.provider === 'apple') {
    return openAppleCalendar(details, options);
  }
  if (isAppleCalendarDevice()) {
    return openAppleCalendar(details, options);
  }
  return openGoogleCalendar(details, { successTitle: options.successTitle });
}

export function offerAddBookingToCalendar(
  message: string,
  details: BookingCalendarDetails | null,
  options?: { alertTitle?: string; bookingId?: string }
): void {
  const title = options?.alertTitle || 'Booked!';

  if (!details) {
    toast.success(title, { description: message, duration: 5000 });
    return;
  }

  const calendarOpts: CalendarFeedbackOptions = {
    bookingConfirmed: true,
    bookingId: options?.bookingId,
  };

  toast.success(title, {
    description: `${message} Add it to your calendar:`,
    duration: 12000,
    action: {
      label: 'Google Calendar',
      onClick: () => {
        openGoogleCalendar(details);
      },
    },
    cancel: {
      label: isAppleCalendarDevice() ? 'Apple Calendar' : 'Download .ics',
      onClick: () => {
        if (isAppleCalendarDevice()) {
          openAppleCalendar(details, calendarOpts);
        } else {
          downloadIcsFile(buildIcsFilename(details), buildIcsEventContent(details));
          toast.success('Calendar file downloaded', {
            description: 'Open the .ics file to add this booking to Outlook or another app.',
          });
        }
      },
    },
  });
}

export async function fetchBookingCalendarDetails(
  bookingId: string,
  facilityName?: string
): Promise<BookingCalendarDetails | null> {
  const response = await bookingApi.getById(bookingId);
  if (!response.success) return null;

  const booking = (response.data as { booking?: Record<string, unknown> })?.booking ?? response.data;
  if (!booking || typeof booking !== 'object') return null;

  const row = booking as Record<string, unknown>;
  const courtName = String(row.courtName || row.court_name || 'Court');
  const bookingDate = String(row.bookingDate || row.booking_date || '');
  const startTime = String(row.startTime || row.start_time || '');
  const endTime = String(row.endTime || row.end_time || '');
  if (!bookingDate || !startTime || !endTime) return null;

  return bookingWithDetailsToCalendarDetails(
    {
      courtName,
      facilityName: facilityName || String(row.facilityName || row.facility_name || ''),
      bookingDate,
      startTime,
      endTime,
      bookingType: (row.bookingType || row.booking_type) as string | undefined,
      notes: (row.notes as string | undefined) || undefined,
    },
    { facilityName }
  );
}
