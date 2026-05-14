/**
 * Normalize facility operating_hours from DB/API for display and lookups.
 * Handles alternate keys (Sat vs saturday), field aliases (open_time), and
 * stringly-typed flags ("false" for closed must not count as closed).
 */

export const OPERATING_DAYS_MONDAY_FIRST = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type OperatingDayMondayFirst = (typeof OPERATING_DAYS_MONDAY_FIRST)[number];

/** JavaScript Date.getDay(): 0 = Sunday … 6 = Saturday */
const DAY_TO_JS_WEEKDAY: Record<OperatingDayMondayFirst, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type DayHoursInput =
  | string
  | {
      open?: string;
      close?: string;
      start?: string;
      end?: string;
      startTime?: string;
      endTime?: string;
      start_time?: string;
      end_time?: string;
      closed?: unknown;
      isClosed?: unknown;
      is_closed?: unknown;
      isOpen?: unknown;
      is_open?: unknown;
      openTime?: string;
      closeTime?: string;
      open_time?: string;
      close_time?: string;
    }
  | null
  | undefined;

export type OperatingHoursMap = Record<string, DayHoursInput>;

export type NormalizedDayHours = {
  closed: boolean;
  display: string;
  openDisplay?: string;
};

export function parseOperatingHoursInput(raw: unknown): OperatingHoursMap {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as OperatingHoursMap;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as OperatingHoursMap;
  }
  return {};
}

export function isTruthyClosed(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

/**
 * Resolve hours for a canonical weekday (lowercase full name).
 *
 * Order matters: many legacy blobs use Monday-first indices (0=Mon … 6=Sun).
 * JavaScript weekday for Saturday is also 6, which would wrongly read Sunday's
 * row if we checked JS numbers before names or Monday-first indices.
 */
export function getOperatingHoursForDay(operatingHours: OperatingHoursMap, day: string): DayHoursInput {
  if (!operatingHours || typeof operatingHours !== 'object') return undefined;
  const dayLower = day.toLowerCase() as OperatingDayMondayFirst;
  const shortName = dayLower.slice(0, 3);

  const variants = [
    dayLower,
    dayLower.toUpperCase(),
    dayLower[0].toUpperCase() + dayLower.slice(1),
    shortName,
    shortName.toUpperCase(),
    shortName[0].toUpperCase() + shortName.slice(1),
  ];

  for (const key of variants) {
    if ((operatingHours as any)[key] !== undefined) {
      return (operatingHours as any)[key] as DayHoursInput;
    }
  }

  for (const [key, value] of Object.entries(operatingHours)) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === dayLower || normalizedKey.startsWith(shortName)) {
      return value as DayHoursInput;
    }
  }

  const mondayFirstIdx = OPERATING_DAYS_MONDAY_FIRST.indexOf(dayLower);
  if (mondayFirstIdx >= 0) {
    for (const key of [String(mondayFirstIdx), mondayFirstIdx]) {
      const v = (operatingHours as any)[key];
      if (v !== undefined) return v as DayHoursInput;
    }
  }

  const jsWeekday = DAY_TO_JS_WEEKDAY[dayLower];
  if (jsWeekday !== undefined) {
    for (const key of [String(jsWeekday), jsWeekday]) {
      const v = (operatingHours as any)[key];
      if (v !== undefined) return v as DayHoursInput;
    }
  }

  return undefined;
}

export function to12HourTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/[aApP][mM]/.test(trimmed)) return trimmed.toUpperCase();
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return trimmed;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function normalizeDayHours(hours: DayHoursInput): NormalizedDayHours {
  if (!hours) {
    return { closed: true, display: 'Closed' };
  }
  if (typeof hours === 'string') {
    const value = hours.trim();
    if (!value || value.toLowerCase() === 'closed') {
      return { closed: true, display: 'Closed' };
    }
    return { closed: false, display: value };
  }
  const h = hours as Record<string, unknown>;
  const explicitlyClosedByFlag =
    h.isOpen === false ||
    h.is_open === false ||
    (typeof h.isOpen === 'string' && h.isOpen.trim().toLowerCase() === 'false') ||
    (typeof h.is_open === 'string' && String(h.is_open).trim().toLowerCase() === 'false');
  const normalizedClosed =
    isTruthyClosed(h.closed) ||
    isTruthyClosed(h.isClosed) ||
    isTruthyClosed(h.is_closed) ||
    explicitlyClosedByFlag;
  if (normalizedClosed) {
    return { closed: true, display: 'Closed' };
  }
  const open =
    h.open ?? h.openTime ?? h.open_time ?? h.start ?? h.startTime ?? h.start_time;
  const close =
    h.close ?? h.closeTime ?? h.close_time ?? h.end ?? h.endTime ?? h.end_time;
  if (open != null && close != null && String(open).trim() && String(close).trim()) {
    const openDisplay = to12HourTime(String(open));
    const closeDisplay = to12HourTime(String(close));
    return {
      closed: false,
      display: `${openDisplay} – ${closeDisplay}`,
      openDisplay,
    };
  }
  return { closed: true, display: 'Closed' };
}

function weekdayKeyInTimezone(date: Date, timeZone?: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timeZone || undefined,
  }).format(date);
  return weekday.toLowerCase();
}

function titleCaseDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export function getTodayHoursMessage(
  operatingHours: OperatingHoursMap,
  timezone?: string,
  now: Date = new Date()
): string {
  const today = weekdayKeyInTimezone(now, timezone);
  const todayHours = normalizeDayHours(getOperatingHoursForDay(operatingHours, today));

  if (!todayHours.closed) {
    return `${todayHours.display} (club local time)`;
  }

  const startIdx = OPERATING_DAYS_MONDAY_FIRST.indexOf(today as OperatingDayMondayFirst);
  if (startIdx < 0) {
    return 'Closed today — please check the weekly schedule.';
  }

  for (let offset = 1; offset <= 7; offset++) {
    const idx = (startIdx + offset) % 7;
    const day = OPERATING_DAYS_MONDAY_FIRST[idx];
    const next = normalizeDayHours(getOperatingHoursForDay(operatingHours, day));
    if (!next.closed) {
      const nextOpen = next.openDisplay || next.display;
      return `Closed today — reopens ${titleCaseDay(day)} at ${nextOpen}.`;
    }
  }

  return 'Closed today — please check with the club for reopening hours.';
}

/** JavaScript weekday order: 0 = Sunday … 6 = Saturday (matches court_operating_config.day_of_week). */
const SUNDAY_FIRST_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Normalize times like "8:00", "08:00:00", "8:00 AM" to HH:MM (24h). */
export function normalizeWallTimeToHHMM(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return fallback;
  const ampmMatch = normalized.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const suffix = ampmMatch[3];
    if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
    if (suffix === 'PM' && h !== 12) h += 12;
    if (suffix === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type CourtOperatingScheduleRow = {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
  prime_time_start: string | null;
  prime_time_end: string | null;
  prime_time_max_duration: number;
  slot_duration: number;
  min_duration: number;
  max_duration: number;
  buffer_before: number;
  buffer_after: number;
};

/**
 * Build a 7-day court_operating_config payload from facility weekly operating_hours.
 * Matches server defaults in courtConfig GET when no per-court rows exist.
 */
export function buildCourtScheduleRowsFromFacilityOperatingHours(
  rawOperatingHours: unknown
): CourtOperatingScheduleRow[] {
  const opHours = parseOperatingHoursInput(rawOperatingHours);

  return SUNDAY_FIRST_DAY_NAMES.map((dayName, i) => {
    const dayConfig = getOperatingHoursForDay(opHours, dayName) as Record<string, unknown> | string | null | undefined;
    const closed =
      !dayConfig ||
      typeof dayConfig === 'string' ||
      isTruthyClosed((dayConfig as any)?.closed) ||
      isTruthyClosed((dayConfig as any)?.isClosed) ||
      isTruthyClosed((dayConfig as any)?.is_closed) ||
      (dayConfig as any)?.isOpen === false ||
      (dayConfig as any)?.is_open === false ||
      (typeof (dayConfig as any)?.isOpen === 'string' &&
        String((dayConfig as any).isOpen).trim().toLowerCase() === 'false') ||
      (typeof (dayConfig as any)?.is_open === 'string' &&
        String((dayConfig as any).is_open).trim().toLowerCase() === 'false');

    const dc = typeof dayConfig === 'object' && dayConfig ? (dayConfig as Record<string, unknown>) : {};
    const open_time = normalizeWallTimeToHHMM(
      dc.open ?? dc.openTime ?? dc.open_time ?? dc.start ?? dc.startTime ?? dc.start_time,
      '08:00'
    );
    const close_time = normalizeWallTimeToHHMM(
      dc.close ?? dc.closeTime ?? dc.close_time ?? dc.end ?? dc.endTime ?? dc.end_time,
      '20:00'
    );

    return {
      day_of_week: i,
      is_open: !closed,
      open_time,
      close_time,
      prime_time_start: null,
      prime_time_end: null,
      prime_time_max_duration: 90,
      slot_duration: 30,
      min_duration: 30,
      max_duration: 120,
      buffer_before: 0,
      buffer_after: 5,
    };
  });
}

/** Stable fingerprint to detect whether weekly hours changed (for syncing courts). */
export function facilityOperatingHoursScheduleFingerprint(raw: unknown): string {
  return JSON.stringify(buildCourtScheduleRowsFromFacilityOperatingHours(raw));
}
