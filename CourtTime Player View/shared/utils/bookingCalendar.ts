/**
 * Shared court-booking calendar helpers (ICS export and event metadata).
 */

export type BookingCalendarDetails = {
  title: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  notes?: string;
};

const DEFAULT_ALARM_MINUTES = 30;

export function formatBookingDateYmd(bookingDate: Date | string): string {
  if (typeof bookingDate === 'string') {
    const match = bookingDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = new Date(String(bookingDate));
  if (Number.isNaN(parsed.getTime())) {
    return String(bookingDate).slice(0, 10);
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function bookingWithDetailsToCalendarDetails(
  booking: {
    courtName?: string;
    bookingDate: Date | string;
    startTime: string;
    endTime: string;
    bookingType?: string;
    notes?: string;
    facilityName?: string;
  },
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

function normalizeTimeForIcs(time: string): string {
  const normalized = time.length >= 5 ? time.slice(0, 5) : time;
  const [hours, minutes] = normalized.split(':');
  return `${hours.padStart(2, '0')}${minutes.padStart(2, '0')}00`;
}

function bookingDateTimeToIcs(dateYmd: string, time: string): string {
  return `${dateYmd.replace(/-/g, '')}T${normalizeTimeForIcs(time)}`;
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let index = 75;
  while (index < line.length) {
    parts.push(` ${line.slice(index, index + 74)}`);
    index += 74;
  }
  return parts.join('\r\n');
}

export function buildIcsEventContent(details: BookingCalendarDetails): string {
  const uid = `courttime-${details.bookingDate}-${details.startTime.replace(/:/g, '')}@courttime.app`;
  const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dtstart = bookingDateTimeToIcs(details.bookingDate, details.startTime);
  const dtend = bookingDateTimeToIcs(details.bookingDate, details.endTime);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CourtTime//Court Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
  ];

  if (details.location) {
    lines.push(`LOCATION:${escapeIcsText(details.location)}`);
  }
  if (details.notes) {
    lines.push(`DESCRIPTION:${escapeIcsText(details.notes)}`);
  }

  lines.push(
    'BEGIN:VALARM',
    `TRIGGER:-PT${DEFAULT_ALARM_MINUTES}M`,
    'ACTION:DISPLAY',
    'DESCRIPTION:Court reservation reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return lines.map(foldIcsLine).join('\r\n');
}

/** Google Calendar template URLs require UTC timestamps ending in Z. */
function bookingDateTimeToGoogleUtc(dateYmd: string, time: string): string {
  const normalized = time.length >= 5 ? time.slice(0, 5) : time;
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [hours, minutes] = normalized.split(':').map(Number);
  const local = new Date(y, m - 1, d, hours, minutes, 0, 0);
  return local.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(details: BookingCalendarDetails): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: details.title,
    dates: `${bookingDateTimeToGoogleUtc(details.bookingDate, details.startTime)}/${bookingDateTimeToGoogleUtc(details.bookingDate, details.endTime)}`,
  });
  if (details.location) params.set('location', details.location);
  if (details.notes) params.set('details', details.notes);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsFilename(details: BookingCalendarDetails): string {
  const slug = details.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'court-booking'}.ics`;
}

/** macOS, iOS, iPadOS — use inline ICS so the OS opens Calendar.app. */
export function isAppleCalendarDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isAppleUa = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua);
  const isIpadOs =
    (navigator.platform === 'MacIntel' || /iPad/i.test(ua)) &&
    navigator.maxTouchPoints > 1;
  return isAppleUa || isIpadOs;
}

export function getBookingCalendarIcsPath(bookingId: string): string {
  return `/api/bookings/${encodeURIComponent(bookingId)}/calendar.ics`;
}
