// ── Layout Constants ──
export const ROW_HEIGHT = 40;            // 30-min visual row height (px)
export const HALF_ROW = 20;              // 15-min half-row height (px)
export const TIME_COL_WIDTH = 80;        // sticky time column width (px)
export const COURT_COL_MIN_WIDTH = 180;  // minimum court column width (px)
export const HEADER_HEIGHT = 44;         // sticky header row height (px)
export const START_HOUR = 6;             // 6 AM
export const END_HOUR = 21;              // 9 PM (last 30-min row starts at 8:30 PM)
export const TOTAL_30MIN_ROWS = (END_HOUR - START_HOUR) * 2; // 30 rows

// ── Time Slot Generators ──

/** Generate 30-min row labels: ["6:00 AM", "6:30 AM", ... "8:30 PM"] */
export function generate30MinSlots(): string[] {
  const slots: string[] = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      slots.push(format12hTime(hour, minute));
    }
  }
  return slots;
}

/** Generate all 15-min slot keys: ["6:00 AM", "6:15 AM", ... "8:45 PM"] */
export function generate15MinSlots(): string[] {
  const slots: string[] = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      slots.push(format12hTime(hour, minute));
    }
  }
  return slots;
}

// ── Time Parsing / Formatting ──

/** Convert "2:30 PM" → { hour24: 14, minute: 30 } */
export function parse12hTime(time12h: string): { hour24: number; minute: number } {
  const [timePart, period] = time12h.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return { hour24: hours, minute: minutes || 0 };
}

/** Convert hour24=14, minute=30 → "2:30 PM" */
export function format12hTime(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const displayHour = hour24 > 12 ? hour24 - 12 : hour24 === 0 ? 12 : hour24;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

/** Convert "2:30 PM" → 0-based 15-min index from START_HOUR (e.g. "6:15 AM" → 1) */
export function get15MinIndex(time12h: string): number {
  const { hour24, minute } = parse12hTime(time12h);
  return (hour24 - START_HOUR) * 4 + Math.floor(minute / 15);
}

/** Convert 24h "HH:MM:SS" or "HH:MM" → "h:MM AM/PM" */
export function format24hTo12h(time24: string): string {
  const [hours24, minutes] = time24.split(':').map(Number);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// ── Eastern Time Helpers ──

export function getEasternTimeComponents(): { hours: number; minutes: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hours, minutes };
}

export function getEasternDate(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
  return new Date(year, month, day);
}

export function formatCurrentEasternTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Booking Color Map (Issue 5) ──

export interface BookingColorSet {
  bg: string;
  border: string;
  accent: string;
  text: string;
}

const BOOKING_COLORS: Record<string, BookingColorSet> = {
  match:               { bg: '#EFF6FF', border: '#BFDBFE', accent: '#3B82F6', text: '#1E40AF' },
  league_match:        { bg: '#F5F3FF', border: '#DDD6FE', accent: '#8B5CF6', text: '#5B21B6' },
  t2_match:            { bg: '#F5F3FF', border: '#DDD6FE', accent: '#8B5CF6', text: '#5B21B6' },
  lesson:              { bg: '#ECFDF5', border: '#A7F3D0', accent: '#10B981', text: '#065F46' },
  ball_machine:        { bg: '#FFFBEB', border: '#FDE68A', accent: '#F59E0B', text: '#92400E' },
  individual_practice: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#10B981', text: '#065F46' },
  other:               { bg: '#F9FAFB', border: '#D1D5DB', accent: '#6B7280', text: '#374151' },
};

const OWN_BOOKING_COLORS: BookingColorSet = {
  bg: '#F0FDFA', border: '#99F6E4', accent: '#0D9488', text: '#134E4A',
};

/** Resolve color for a booking, using teal for user's own bookings */
export function resolveBookingColor(
  bookingType: string | undefined,
  bookingUserId: string,
  currentUserId: string | undefined,
): BookingColorSet {
  if (currentUserId && bookingUserId === currentUserId) {
    return OWN_BOOKING_COLORS;
  }
  if (!bookingType) return BOOKING_COLORS.other;
  const normalized = bookingType.toLowerCase().replace(/\s+/g, '_');
  return BOOKING_COLORS[normalized] || BOOKING_COLORS.other;
}

// ── Date Helpers ──

export function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
