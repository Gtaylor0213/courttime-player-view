import { describe, expect, it } from '@jest/globals';
import { configFromDraft, humanizeKey } from '../app/admin/booking-rules';

describe('booking rules helpers', () => {
  it('humanises config keys', () => {
    expect(humanizeKey('max_active_reservations')).toBe('Max active reservations');
    expect(humanizeKey('advanceDays')).toBe('Advance days');
  });
  it('coerces drafts back to the reference types', () => {
    expect(configFromDraft({ max: '5', on: true, types: 'match, lesson' }, { max: 2, on: false, types: ['match'] })).toEqual({ max: 5, on: true, types: ['match', 'lesson'] });
    expect(configFromDraft({ start: '08:00' }, { start: '07:00' })).toEqual({ start: '08:00' });
  });
});
