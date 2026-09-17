import { blackoutsToBlockedRanges, type BlackoutRow } from './blackoutSlots';

/** Response shape from GET /api/court-config/:courtId/availability */
export interface CourtAvailabilityData {
  date: string;
  isOpen: boolean;
  operatingHours: { open: string; close: string };
  slotDuration: number;
  existingBookings: Array<{ startTime: string; endTime: string; start_time?: string; end_time?: string }>;
  /** Court-specific and facility-wide maintenance blackouts touching this date. */
  blackouts?: BlackoutRow[];
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export function parseHHMMToMinutes(t: string): number {
  const parts = String(t).split(':');
  return parseInt(parts[0] || '0', 10) * 60 + parseInt(parts[1] || '0', 10);
}

export function formatMinutesAsHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Normalize API booking row to start/end HH:MM (no seconds). */
function bookingBounds(row: CourtAvailabilityData['existingBookings'][0]): { start: string; end: string } | null {
  const start = row.startTime || row.start_time;
  const end = row.endTime || row.end_time;
  if (!start || !end) return null;
  const startMin = parseHHMMToMinutes(start);
  const endMin = parseHHMMToMinutes(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return null;
  return { start: formatMinutesAsHHMM(startMin), end: formatMinutesAsHHMM(endMin) };
}

/** Expand bookings into occupied slot start times (HH:MM) at slotDuration granularity. */
export function bookedStartTimesFromAvailability(
  data: CourtAvailabilityData,
  slotDurationMinutes?: number
): Set<string> {
  const slotDuration = slotDurationMinutes ?? data.slotDuration ?? 30;
  const booked = new Set<string>();
  const occupy = (start: string, end: string) => {
    let t = parseHHMMToMinutes(start);
    const endMin = parseHHMMToMinutes(end);
    while (t < endMin) {
      booked.add(formatMinutesAsHHMM(t));
      t += slotDuration;
    }
  };
  for (const row of data.existingBookings || []) {
    const bounds = bookingBounds(row);
    if (!bounds) continue;
    occupy(bounds.start, bounds.end);
  }
  // Maintenance blackouts occupy their slots too, so Quick Reserve and the
  // booking form never offer a window the calendar shows as blocked.
  if (data.blackouts?.length && data.date) {
    for (const range of blackoutsToBlockedRanges(data.blackouts, data.date, ['*'])) {
      occupy(range.startTime.slice(0, 5), range.endTime.slice(0, 5));
    }
  }
  return booked;
}

export function buildTimeSlotsFromAvailability(
  data: CourtAvailabilityData,
  selectedDate: string,
  todayYmd: string
): TimeSlot[] {
  if (!data.isOpen) return [];
  const slotDuration = data.slotDuration || 30;
  const openMin = parseHHMMToMinutes(data.operatingHours.open);
  const closeMin = parseHHMMToMinutes(data.operatingHours.close);
  const bookedTimes = bookedStartTimesFromAvailability(data, slotDuration);
  const slots: TimeSlot[] = [];

  for (let t = openMin; t < closeMin; t += slotDuration) {
    const endT = t + slotDuration;
    if (endT > closeMin) break;
    const startTime = `${formatMinutesAsHHMM(t)}:00`;
    const endTime = `${formatMinutesAsHHMM(endT)}:00`;
    // A slot stays bookable until it ends: 7:00–7:30 is still open at 7:05.
    const isToday = selectedDate === todayYmd;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotPast = isToday && nowMinutes >= endT;

    slots.push({
      startTime,
      endTime,
      available: !bookedTimes.has(formatMinutesAsHHMM(t)) && !slotPast,
    });
  }

  return slots;
}

/**
 * Open start times with the end of each contiguous open run — what Quick
 * Reserve lists per court. Exported for tests.
 */
export function openStartWindows(slots: TimeSlot[]): Array<{ startTime: string; endTime: string; runEnd: string }> {
  const out: Array<{ startTime: string; endTime: string; runEnd: string }> = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (!s.available) continue;
    let j = i;
    while (j + 1 < slots.length && slots[j + 1]!.available && slots[j + 1]!.startTime === slots[j]!.endTime) j++;
    out.push({ startTime: s.startTime, endTime: s.endTime, runEnd: slots[j]!.endTime });
  }
  return out;
}

/** Build court-name → booked HH:MM slots map (BookingWizard additional-courts check). */
export function buildExistingBookingsMapByCourtName(
  courts: Array<{ id: string; name: string }>,
  availabilityByCourtId: Record<string, CourtAvailabilityData | undefined>
): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const court of courts) {
    const data = availabilityByCourtId[court.id];
    if (!data) continue;
    map[court.name] = bookedStartTimesFromAvailability(data);
  }
  return map;
}

/** Convert 24h HH:MM to 12h "h:mm AM/PM" for QuickReserve slot sets. */
export function to12HourSlotLabel(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h24)) return hhmm;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function buildExistingBookingsMap12h(
  courts: Array<{ id: string; name: string }>,
  availabilityByCourtId: Record<string, CourtAvailabilityData | undefined>
): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const court of courts) {
    const data = availabilityByCourtId[court.id];
    if (!data) continue;
    const booked24 = bookedStartTimesFromAvailability(data);
    map[court.name] = new Set([...booked24].map(to12HourSlotLabel));
  }
  return map;
}
