/**
 * Booking-rule display helpers for the Club Info screen, shared by web and
 * mobile.
 *
 * The max-duration precedence mirrors the booking rules engine
 * (`rulesEngine/index.ts`): when the per-court-type limit is enabled, each
 * court type uses its own override if set and otherwise falls back to the
 * facility default. It is fiddly enough — three generations of key names, plus
 * the court-type split — that reimplementing it per client is how the two
 * drift apart.
 */

import { safeDisplayText } from './safeDisplayText';

/** Booking rules arrive as loosely-typed JSON from the facility record. */
export type BookingRulesLike = Record<string, unknown> | null | undefined;

export type MaxBookingDurationDisplay =
  | string
  | { tennis: string | null; pickleball: string | null }
  | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Empty string means "nothing to show", so callers can treat it as absent. */
export function ruleValue(value: unknown): string | null {
  const s = safeDisplayText(value);
  return s === '' ? null : s;
}

function hoursLabel(totalMinutes: number): string | null {
  const hours = totalMinutes / 60;
  const label = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
  return ruleValue(label);
}

/**
 * The facility-wide max booking duration in hours, across the key shapes the
 * admin UI has used over time:
 *   - `maxReservationDuration: { enabled, limit }` (minutes) — current
 *   - `maxReservationDurationEnabled` + `maxReservationDurationMinutes` — flat
 *   - `maxBookingDurationUnlimited` + `maxBookingDurationHours` — legacy
 */
export function getMaxBookingDurationHoursLabel(rules: BookingRulesLike): string | null {
  const bookingRules = asRecord(rules);
  if (!bookingRules) return null;

  const mrd = asRecord(bookingRules.maxReservationDuration);
  if (mrd) {
    if (mrd.enabled === false) return null;
    const limitMin = Number(mrd.limit);
    if (Number.isFinite(limitMin) && limitMin > 0) {
      return hoursLabel(limitMin);
    }
  }

  if (bookingRules.maxReservationDurationEnabled === false) return null;
  if (bookingRules.maxReservationDurationEnabled === true) {
    const flatMin = Number(bookingRules.maxReservationDurationMinutes);
    if (Number.isFinite(flatMin) && flatMin > 0) {
      // Values of 12 or less are hours in the older shape, not minutes.
      const totalMin = flatMin <= 12 ? Math.round(flatMin * 60) : Math.round(flatMin);
      return hoursLabel(totalMin);
    }
  }

  if (bookingRules.maxBookingDurationUnlimited === true) return null;
  if (bookingRules.maxBookingDurationUnlimited === false) {
    return ruleValue(bookingRules.maxBookingDurationHours);
  }

  return null;
}

/**
 * Max booking duration for display: one label when tennis and pickleball agree
 * (or the split is off), otherwise a label per court type.
 */
export function getMaxBookingDurationDisplay(rules: BookingRulesLike): MaxBookingDurationDisplay {
  const bookingRules = asRecord(rules);
  if (!bookingRules) return null;

  const defaultLabel = getMaxBookingDurationHoursLabel(bookingRules);

  const byCourtType = asRecord(bookingRules.maxReservationDurationByCourtType);
  const byCourtTypeEnabled = byCourtType
    ? byCourtType.enabled === true
    : bookingRules.maxReservationDurationByCourtTypeEnabled === true;

  if (!byCourtTypeEnabled) return defaultLabel;

  const tennisMin =
    Number(byCourtType?.tennisMinutes ?? bookingRules.maxReservationDurationTennisMinutes) || 0;
  const pickleballMin =
    Number(byCourtType?.pickleballMinutes ?? bookingRules.maxReservationDurationPickleballMinutes) ||
    0;

  const tennisLabel = tennisMin > 0 ? hoursLabel(tennisMin) : defaultLabel;
  const pickleballLabel = pickleballMin > 0 ? hoursLabel(pickleballMin) : defaultLabel;

  if (tennisLabel === pickleballLabel) return tennisLabel;

  return { tennis: tennisLabel, pickleball: pickleballLabel };
}

/**
 * Booking rules as stored: sometimes an object, sometimes a JSON string, and
 * `peakHoursSlots` inside can itself be a JSON string. Returns null when the
 * value cannot be parsed, so callers show the empty state rather than crash.
 */
export function parseBookingRules(raw: unknown): Record<string, unknown> | null {
  let parsed: unknown = raw;

  if (typeof parsed === 'string') {
    if (!parsed.trim()) return null;
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  const rules = asRecord(parsed);
  if (!rules) return null;

  const slots = rules.peakHoursSlots;
  if (typeof slots === 'string' && slots.trim()) {
    try {
      const inner = JSON.parse(slots);
      if (Array.isArray(inner)) rules.peakHoursSlots = inner;
    } catch {
      // Leave the raw string; getPeakHoursSlotDisplays ignores non-arrays.
    }
  }

  return rules;
}

export interface ClubInfoRuleRow {
  label: string;
  value: string;
}

/**
 * The structured booking-rule rows Club Info lists, in display order. Rows the
 * facility has not configured are omitted, so an empty array means there is
 * nothing to show.
 */
export function getClubInfoRuleRows(rules: BookingRulesLike): ClubInfoRuleRow[] {
  const bookingRules = asRecord(rules);
  if (!bookingRules) return [];

  const rows: ClubInfoRuleRow[] = [];

  const advanceDays = ruleValue(bookingRules.advanceBookingDays);
  if (bookingRules.advanceBookingDaysUnlimited === false && advanceDays) {
    rows.push({ label: 'Book up to', value: `${advanceDays} days in advance` });
  }

  const duration = getMaxBookingDurationDisplay(bookingRules);
  if (typeof duration === 'string') {
    rows.push({ label: 'Max booking duration', value: `${duration} hours` });
  } else if (duration) {
    if (duration.tennis) {
      rows.push({ label: 'Max duration (Tennis)', value: `${duration.tennis} hours` });
    }
    if (duration.pickleball) {
      rows.push({ label: 'Max duration (Pickleball)', value: `${duration.pickleball} hours` });
    }
  }

  const perWeek = ruleValue(bookingRules.maxBookingsPerWeek);
  if (bookingRules.maxBookingsPerWeekUnlimited === false && perWeek) {
    rows.push({ label: 'Max bookings per week', value: perWeek });
  }

  if (bookingRules.noOverlappingReservations) {
    rows.push({ label: 'Overlapping bookings', value: 'Not allowed' });
  }

  return rows;
}

export interface PeakHoursSlotDisplay {
  heading: string;
  details: string[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatClockTime(value: unknown): string {
  const s = safeDisplayText(value).trim();
  if (!s) return '';
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h)) return s;
  const period = h >= 12 ? 'PM' : 'AM';
  return Number.isFinite(m)
    ? `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
    : `${h % 12 || 12} ${period}`;
}

/** Peak-hour slots formatted for display, one entry per configured slot. */
export function getPeakHoursSlotDisplays(slots: unknown): PeakHoursSlotDisplay[] {
  if (!Array.isArray(slots)) return [];

  return slots.map((raw) => {
    const slot = asRecord(raw) ?? {};
    const days = Array.isArray(slot.days)
      ? (slot.days as unknown[])
          .map((d) => DAY_NAMES[Number(d)])
          .filter(Boolean)
          .join(', ')
      : '';
    const start = formatClockTime(slot.startTime);
    const end = formatClockTime(slot.endTime);

    const heading = `${start} – ${end}${days ? ` · ${days}` : ''}`;
    const details: string[] = [];

    const slotRules = asRecord(slot.rules) ?? {};
    const perDay = ruleValue(slotRules.maxBookingsPerDay);
    if (!slotRules.maxBookingsPerDayUnlimited && perDay) {
      details.push(`Max ${perDay} booking(s) per day during peak hours`);
    }
    const maxDuration = ruleValue(slotRules.maxDurationHours);
    if (!slotRules.maxDurationUnlimited && maxDuration) {
      details.push(`Max duration: ${maxDuration} hours`);
    }

    return { heading, details };
  });
}
