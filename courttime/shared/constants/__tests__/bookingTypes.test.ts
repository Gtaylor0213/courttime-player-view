import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPES,
  RESERVATION_LABEL_TYPE_KEYS,
  DEER_LAKE_RESERVATION_TYPE_KEYS,
  BHR_RESERVATION_TYPE_KEYS,
  MEDLOCK_RESERVATION_TYPE_KEYS,
  getBookingTypeLabel,
  reservationTypeKeysForCourts,
  reservationTypeKeysForRole,
  isAdminOnlyReservationType,
} from '../bookingTypes';

describe('bookingTypes', () => {
  it('exposes stable reservation label keys', () => {
    expect(RESERVATION_LABEL_TYPE_KEYS).toEqual([
      'match',
      'league_match',
      't2_match',
      'lesson',
      'group_lesson',
      'ball_machine',
    ]);
  });

  it('labels match for player bookable types', () => {
    expect(getBookingTypeLabel('match')).toBe('Fun');
    expect(getBookingTypeLabel('league_match')).toBe('League Match');
    expect(getBookingTypeLabel('ball_machine')).toBe('Ball Machine');
  });

  it('includes bulletin activity types in full map', () => {
    expect(BOOKING_TYPES.clinic.label).toBe('Clinic');
    expect(BOOKING_TYPES.tournament.label).toBe('Tournament');
  });
});

describe('reservationTypeKeysForCourts', () => {
  it('offers only tennis types (plus Maintenance) on a Deer Lake tennis court', () => {
    expect(reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, ['Tennis'])).toEqual([
      'general_tennis',
      'team_tennis_practice',
      'alta_tennis',
      'usta_tennis',
      'flex_tennis',
      'team_tennis_lesson',
      'group_tennis_lesson',
      'private_tennis_lesson',
      'junior_tennis_lesson',
      'after_school_tennis_lesson',
      'open_play',
      'cardio_tennis',
      'maintenance',
    ]);
  });

  it('offers only pickleball types (plus Maintenance) on a Deer Lake pickleball court', () => {
    expect(reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, ['Pickleball'])).toEqual([
      'general_pickleball',
      'team_pickleball_practice',
      'alta_pickleball',
      'usta_pickleball',
      'flex_pickleball',
      'team_pickleball_lesson',
      'group_pickleball_lesson',
      'private_pickleball_lesson',
      'maintenance',
    ]);
  });

  it('keeps only types that fit both when tennis and pickleball courts are booked together', () => {
    expect(reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, ['Tennis', 'pickleball'])).toEqual([
      'maintenance',
    ]);
  });

  it('leaves the list alone with no courts, or courts that are neither tennis nor pickleball', () => {
    expect(reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, [])).toBe(DEER_LAKE_RESERVATION_TYPE_KEYS);
    expect(reservationTypeKeysForCourts(DEER_LAKE_RESERVATION_TYPE_KEYS, ['Dual Purpose', undefined])).toBe(
      DEER_LAKE_RESERVATION_TYPE_KEYS,
    );
  });

  it('does not change the standard or BHR lists', () => {
    expect(reservationTypeKeysForCourts(RESERVATION_LABEL_TYPE_KEYS, ['Pickleball'])).toEqual(RESERVATION_LABEL_TYPE_KEYS);
    expect(reservationTypeKeysForCourts(BHR_RESERVATION_TYPE_KEYS, ['Tennis'])).toEqual(BHR_RESERVATION_TYPE_KEYS);
  });

  it('Medlock keeps the standard list but swaps Group Lesson for Team Practice', () => {
    expect(MEDLOCK_RESERVATION_TYPE_KEYS).toEqual([
      'match',
      'league_match',
      't2_match',
      'lesson',
      'team_practice',
      'ball_machine',
    ]);
    expect(getBookingTypeLabel('team_practice')).toBe('Team Practice');
    expect(reservationTypeKeysForCourts(MEDLOCK_RESERVATION_TYPE_KEYS, ['Tennis'])).toEqual(MEDLOCK_RESERVATION_TYPE_KEYS);
  });
});

describe('reservationTypeKeysForRole', () => {
  it('shows members only the Deer Lake types open to everyone', () => {
    expect(reservationTypeKeysForRole(DEER_LAKE_RESERVATION_TYPE_KEYS, false)).toEqual([
      'general_tennis',
      'team_tennis_practice',
      'alta_tennis',
      'usta_tennis',
      'flex_tennis',
      'general_pickleball',
      'team_pickleball_practice',
      'alta_pickleball',
      'usta_pickleball',
      'flex_pickleball',
    ]);
    expect(getBookingTypeLabel('team_tennis_practice')).toBe('Team Tennis Practice');
    expect(getBookingTypeLabel('team_pickleball_practice')).toBe('Team Pickleball Practice');
  });

  it('gives admins the full Deer Lake list', () => {
    expect(reservationTypeKeysForRole(DEER_LAKE_RESERVATION_TYPE_KEYS, true)).toBe(DEER_LAKE_RESERVATION_TYPE_KEYS);
    expect(isAdminOnlyReservationType('private_tennis_lesson')).toBe(true);
    expect(isAdminOnlyReservationType('maintenance')).toBe(true);
    expect(isAdminOnlyReservationType('general_tennis')).toBe(false);
  });

  it('does not change the standard, BHR, or Medlock lists for members', () => {
    expect(reservationTypeKeysForRole(RESERVATION_LABEL_TYPE_KEYS, false)).toBe(RESERVATION_LABEL_TYPE_KEYS);
    expect(reservationTypeKeysForRole(BHR_RESERVATION_TYPE_KEYS, false)).toBe(BHR_RESERVATION_TYPE_KEYS);
    expect(reservationTypeKeysForRole(MEDLOCK_RESERVATION_TYPE_KEYS, false)).toBe(MEDLOCK_RESERVATION_TYPE_KEYS);
  });
});
