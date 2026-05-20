import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPES,
  RESERVATION_LABEL_TYPE_KEYS,
  getBookingTypeLabel,
} from '../bookingTypes';

describe('bookingTypes', () => {
  it('exposes stable reservation label keys', () => {
    expect(RESERVATION_LABEL_TYPE_KEYS).toEqual([
      'match',
      'league_match',
      't2_match',
      'lesson',
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
