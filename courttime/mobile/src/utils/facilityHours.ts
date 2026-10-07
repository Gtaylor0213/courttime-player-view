/**
 * Facility operating hours for the admin Facility screen — the same per-day
 * shape the web admin edits ({ open, close, closed }), read from either the
 * object form or the legacy "08:00 - 20:00" / "Closed" strings.
 */

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export const HOURS_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type HoursDay = (typeof HOURS_DAYS)[number];
export type FacilityHours = Record<HoursDay, DayHours>;

/** The web admin's defaults for a facility with no hours saved. */
export const DEFAULT_FACILITY_HOURS: FacilityHours = {
  monday: { open: '08:00', close: '20:00', closed: false },
  tuesday: { open: '08:00', close: '20:00', closed: false },
  wednesday: { open: '08:00', close: '20:00', closed: false },
  thursday: { open: '08:00', close: '20:00', closed: false },
  friday: { open: '08:00', close: '20:00', closed: false },
  saturday: { open: '09:00', close: '18:00', closed: false },
  sunday: { open: '09:00', close: '18:00', closed: false },
};

export function readFacilityHours(raw: unknown): FacilityHours {
  let source: Record<string, unknown> = {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') source = parsed as Record<string, unknown>;
  } catch {
    source = {};
  }
  const out = {} as FacilityHours;
  for (const day of HOURS_DAYS) {
    const fallback = DEFAULT_FACILITY_HOURS[day];
    const value = source[day];
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      out[day] = {
        open: typeof v.open === 'string' && v.open ? v.open : fallback.open,
        close: typeof v.close === 'string' && v.close ? v.close : fallback.close,
        closed: v.closed === true,
      };
    } else if (typeof value === 'string') {
      if (value.trim().toLowerCase() === 'closed') out[day] = { ...fallback, closed: true };
      else {
        const [open, close] = value.split(' - ');
        out[day] = { open: open?.trim() || fallback.open, close: close?.trim() || fallback.close, closed: false };
      }
    } else {
      out[day] = { ...fallback };
    }
  }
  return out;
}

const isHHMM = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** A message naming the first bad day, or null when the hours can be saved. */
export function validateFacilityHours(hours: FacilityHours): string | null {
  for (const day of HOURS_DAYS) {
    const h = hours[day];
    if (h.closed) continue;
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    if (!isHHMM(h.open) || !isHHMM(h.close)) return `${label}: enter times as HH:MM (24-hour), for example 08:00.`;
    if (h.close <= h.open) return `${label}: closing time must be after opening time.`;
  }
  return null;
}
