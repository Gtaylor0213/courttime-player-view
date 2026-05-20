/** Response shape from GET /api/court-config/:courtId/availability */
export interface CourtAvailabilityData {
  date: string;
  isOpen: boolean;
  operatingHours: { open: string; close: string };
  slotDuration: number;
  existingBookings: Array<{ startTime: string; endTime: string; start_time?: string; end_time?: string }>;
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
  for (const row of data.existingBookings || []) {
    const bounds = bookingBounds(row);
    if (!bounds) continue;
    let t = parseHHMMToMinutes(bounds.start);
    const endMin = parseHHMMToMinutes(bounds.end);
    while (t < endMin) {
      booked.add(formatMinutesAsHHMM(t));
      t += slotDuration;
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
    const isToday = selectedDate === todayYmd;
    const now = new Date();
    const slotPast =
      isToday &&
      (t / 60 < now.getHours() ||
        (Math.floor(t / 60) === now.getHours() && t % 60 <= now.getMinutes()));

    slots.push({
      startTime,
      endTime,
      available: !bookedTimes.has(formatMinutesAsHHMM(t)) && !slotPast,
    });
  }

  return slots;
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
