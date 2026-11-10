import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPES,
  RESERVATION_LABEL_TYPE_KEYS,
  DEER_LAKE_RESERVATION_TYPE_KEYS,
  BHR_RESERVATION_TYPE_KEYS,
  getBookingTypeLabel,
  reservationTypeKeysForCourts,
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
});
