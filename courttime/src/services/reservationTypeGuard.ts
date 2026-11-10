import { query } from '../database/connection';
import { isFeatureEnabled } from './featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  BOOKING_TYPES,
  DEER_LAKE_RESERVATION_TYPE_KEYS,
  reservationTypeKeysForCourts,
  type BookingTypeKey,
} from '../../shared/constants/bookingTypes';

/**
 * Server-side check for clubs on the Deer Lake reservation type list.
 *
 * The web and app pickers already limit the choice, but a client that has not
 * loaded the club's flags yet (or an older app build) falls back to the
 * standard list and can send a type like `match` ("Fun"). This is the backstop:
 * with the flag on, a booking must carry a Deer Lake type that fits the sport
 * of every court it is on.
 *
 * Returns an error message to show the user, or null when the type is fine
 * (including whenever the facility does not use the Deer Lake list).
 */
export async function checkReservationType(params: {
  facilityId: string | null | undefined;
  bookingType: unknown;
  courtIds: ReadonlyArray<unknown>;
}): Promise<string | null> {
  const { facilityId } = params;
  if (!facilityId) return null;
  if (!(await isFeatureEnabled(facilityId, FEATURE_FLAGS.DEER_LAKE_RESERVATION_TYPES))) return null;

  const type = typeof params.bookingType === 'string' ? params.bookingType.trim() : '';
  if (!type) return 'Please select a reservation type.';
  if (!DEER_LAKE_RESERVATION_TYPE_KEYS.includes(type as BookingTypeKey)) {
    return "Please select one of this club's reservation types.";
  }

  const courtIds = [...new Set(params.courtIds.filter((id): id is string => typeof id === 'string' && !!id))];
  if (courtIds.length === 0) return null;
  const result = await query(`SELECT court_type FROM courts WHERE id::text = ANY($1::text[])`, [courtIds]);
  const courtTypes: string[] = result.rows.map((r: any) => r.court_type);
  const allowed = reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, courtTypes);
  if (allowed.includes(type as BookingTypeKey)) return null;

  const label = BOOKING_TYPES[type as BookingTypeKey]?.label ?? type;
  const sports = new Set(courtTypes.map((t) => String(t ?? '').trim().toLowerCase()));
  if (sports.has('tennis') && sports.has('pickleball')) {
    return `${label} can't be booked on tennis and pickleball courts together. Please choose a different reservation type.`;
  }
  const sport = sports.has('pickleball') ? 'pickleball' : 'tennis';
  return `${label} isn't available on ${sport} courts. Please choose a different reservation type.`;
}

/** Same set of ids, ignoring order and duplicates. */
export function sameCourtSet(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((id) => sb.has(id));
}
