import { Platform } from 'react-native';
import { showAlert } from './alert';
import {
  addBookingToDeviceCalendar,
  type DeviceCalendarAddResult,
  type DeviceCalendarEventInput,
} from './deviceCalendar';
import { parseLocalDate } from './dateUtils';
import { api } from '../api/client';
import type { BookingWithDetails } from '../types/database';

export type BookingCalendarDetails = DeviceCalendarEventInput & { title: string };

const DEFAULT_ALARM_MINUTES = 30;

export function formatBookingDateYmd(bookingDate: Date | string): string {
  if (typeof bookingDate === 'string') {
    const match = bookingDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = parseLocalDate(String(bookingDate));
  if (Number.isNaN(parsed.getTime())) {
    return String(bookingDate).slice(0, 10);
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function bookingWithDetailsToCalendarDetails(
  booking: Pick<
    BookingWithDetails,
    'courtName' | 'bookingDate' | 'startTime' | 'endTime' | 'bookingType' | 'notes' | 'facilityName'
  >,
  options?: { facilityName?: string }
): BookingCalendarDetails {
  const facilityName = options?.facilityName || booking.facilityName;
  const courtName = booking.courtName || 'Court';
  return {
    title: facilityName ? `${facilityName} - ${courtName}` : `Court booking - ${courtName}`,
    bookingDate: formatBookingDateYmd(booking.bookingDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    location: facilityName || undefined,
    notes: [
      'Booked from CourtTime.',
      booking.bookingType ? `Booking type: ${booking.bookingType}.` : null,
      booking.notes?.trim() ? `Notes: ${booking.notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function reportCalendarAddFailure(
  result: DeviceCalendarAddResult,
  options?: { bookingConfirmed?: boolean }
): void {
  const confirmedPrefix = options?.bookingConfirmed !== false
    ? 'Your booking is confirmed'
    : 'CourtTime';

  if (result.reason === 'permission_denied') {
    showAlert(
      'Calendar access denied',
      `${confirmedPrefix}. To add future bookings, allow calendar access in your device settings.`
    );
    return;
  }

  if (result.reason === 'no_writable_calendar') {
    showAlert(
      'No writable calendar found',
      `${confirmedPrefix}, but CourtTime could not find a calendar it can write to on this device.`
    );
    return;
  }

  if (result.reason === 'unsupported') {
    showAlert(
      'Calendar not supported',
      `${confirmedPrefix}, but calendar integration is not available on this device.`
    );
    return;
  }

  showAlert(
    'Could not add to calendar',
    `${confirmedPrefix}, but CourtTime could not add it to your device calendar.`
  );
}

export async function addBookingToCalendarWithFeedback(
  details: BookingCalendarDetails,
  options?: { successTitle?: string; bookingConfirmed?: boolean }
): Promise<boolean> {
  if (Platform.OS === 'web') {
    showAlert(
      'Calendar not supported',
      'Calendar integration is not available in the mobile web app. Use the native app to add bookings to your device calendar.'
    );
    return false;
  }

  const result = await addBookingToDeviceCalendar({
    ...details,
    alarmMinutesBefore: DEFAULT_ALARM_MINUTES,
  });

  if (result.success) {
    showAlert(
      options?.successTitle || 'Added to Calendar',
      'This booking was added to your device calendar.'
    );
    return true;
  }

  reportCalendarAddFailure(result, { bookingConfirmed: options?.bookingConfirmed });
  return false;
}

export function offerAddBookingToCalendar(
  message: string,
  details: BookingCalendarDetails | null,
  options?: { alertTitle?: string }
): void {
  const alertTitle = options?.alertTitle || 'Booked!';

  if (!details || Platform.OS === 'web') {
    showAlert(alertTitle, message);
    return;
  }

  showAlert(alertTitle, `${message}\n\nAdd it to your device calendar?`, [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Add to Calendar',
      onPress: () => {
        void addBookingToCalendarWithFeedback(details, { bookingConfirmed: true });
      },
    },
  ]);
}

export async function fetchBookingCalendarDetails(
  bookingId: string,
  facilityName?: string
): Promise<BookingCalendarDetails | null> {
  const res = await api.get(`/api/bookings/${bookingId}`);
  if (!res.success) return null;

  const booking = (res.data as { booking?: Record<string, unknown> })?.booking ?? res.data;
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
      facilityName: facilityName || '',
      bookingDate,
      startTime,
      endTime,
      bookingType: (row.bookingType || row.booking_type) as string | undefined,
      notes: (row.notes as string | undefined) || undefined,
    },
    { facilityName }
  );
}
