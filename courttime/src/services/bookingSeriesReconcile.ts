/**
 * Diffing an edited recurrence rule against the bookings a series already has.
 *
 * Pure and DB-free so the classification can be tested exhaustively: the
 * service layer takes the plan this produces and executes it inside one
 * transaction.
 *
 * The rule is a default, not a constraint. An instance that was individually
 * moved to another court or time still matches by (date, court) and is
 * reshaped back onto the rule only when the rule itself changed -- and a date
 * the person explicitly unchecked is dropped no matter what the rule says.
 */
import {
  expandRecurrence,
  occurrenceKey,
  type RecurrenceOccurrence,
  type RecurrenceRule,
} from '../../shared/utils/recurrence';

/** An existing bookings row belonging to the series. */
export interface SeriesInstance {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
}

export interface ReshapeAction {
  booking: SeriesInstance;
  to: RecurrenceOccurrence;
}

export interface ReconcilePlan {
  /** Already correct: no write needed. */
  keep: SeriesInstance[];
  /** Same date + court, different time or duration. */
  reshape: ReshapeAction[];
  /** Dates or courts the rule now covers but the series has no booking for. */
  create: RecurrenceOccurrence[];
  /** Bookings the rule no longer covers, or dates the person unchecked. */
  cancel: SeriesInstance[];
  /** In scope but in the past, so deliberately left alone. */
  untouchedPast: SeriesInstance[];
}

export interface ReconcileOptions {
  /** Every non-cancelled booking currently in the series. */
  instances: SeriesInstance[];
  /** The edited rule. */
  rule: RecurrenceRule;
  /** Only instances on/after this date take part; earlier ones are out of scope. */
  fromDate?: string;
  /** Only instances on/before this date take part. */
  toDate?: string;
  /** Dates the person unchecked in the date list: never created, always cancelled. */
  excludeDates?: string[];
  /** Today as `YYYY-MM-DD`; instances before it are protected unless includePast. */
  today: string;
  /** Let the edit rewrite instances that have already happened. */
  includePast?: boolean;
}

/** `18:00` / `18:00:00.000` / Date-ish strings all collapse to `HH:MM:SS`. */
function normalizeTime(value: string): string {
  const match = String(value ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return String(value ?? '');
  const [, h, m, s] = match;
  return `${h.padStart(2, '0')}:${m}:${s ?? '00'}`;
}

function sameShape(instance: SeriesInstance, target: RecurrenceOccurrence): boolean {
  return (
    normalizeTime(instance.startTime) === normalizeTime(target.startTime) &&
    normalizeTime(instance.endTime) === normalizeTime(target.endTime) &&
    Number(instance.durationMinutes) === Number(target.durationMinutes)
  );
}

/**
 * Classify every in-scope booking and every date the rule now covers into
 * keep / reshape / create / cancel.
 */
export function reconcileSeries(options: ReconcileOptions): ReconcilePlan {
  const {
    instances,
    rule,
    fromDate,
    toDate,
    excludeDates = [],
    today,
    includePast = false,
  } = options;

  const excluded = new Set(excludeDates);
  const inScope = (date: string) =>
    (!fromDate || date >= fromDate) && (!toDate || date <= toDate);

  const plan: ReconcilePlan = {
    keep: [],
    reshape: [],
    create: [],
    cancel: [],
    untouchedPast: [],
  };

  // Only live rows can be reshaped or cancelled; a cancelled row is left as a
  // tombstone, and the rule re-creating that date produces a fresh booking.
  const live = instances.filter(
    (i) => i.status !== 'cancelled' && inScope(i.bookingDate)
  );

  const targets = expandRecurrence(rule).filter(
    (t) => inScope(t.bookingDate) && !excluded.has(t.bookingDate)
  );

  const byKey = new Map<string, SeriesInstance>();
  for (const instance of live) {
    // Two live rows on the same court and date should not exist; if they do,
    // the first is matched and the rest fall through to cancel as duplicates.
    const key = occurrenceKey(instance.courtId, instance.bookingDate);
    if (!byKey.has(key)) byKey.set(key, instance);
  }

  const matched = new Set<string>();

  for (const target of targets) {
    const key = occurrenceKey(target.courtId, target.bookingDate);
    const existing = byKey.get(key);

    if (!existing) {
      // Re-creating a date that has already passed helps nobody.
      if (!includePast && target.bookingDate < today) continue;
      plan.create.push(target);
      continue;
    }

    matched.add(existing.id);
    if (!includePast && existing.bookingDate < today) {
      plan.untouchedPast.push(existing);
    } else if (sameShape(existing, target)) {
      plan.keep.push(existing);
    } else {
      plan.reshape.push({ booking: existing, to: target });
    }
  }

  for (const instance of live) {
    if (matched.has(instance.id)) continue;
    if (!includePast && instance.bookingDate < today) {
      plan.untouchedPast.push(instance);
      continue;
    }
    plan.cancel.push(instance);
  }

  return plan;
}

/** True when the plan would write nothing. */
export function isNoopPlan(plan: ReconcilePlan): boolean {
  return (
    plan.reshape.length === 0 && plan.create.length === 0 && plan.cancel.length === 0
  );
}
