import { describe, expect, it } from '@jest/globals';
import { parseSplitNames, readCourtSplit } from '../src/utils/courtSplit';
import { readFacilityHours, validateFacilityHours, DEFAULT_FACILITY_HOURS } from '../src/utils/facilityHours';

/**
 * The server removes a split court's halves that are not sent back, and their
 * reservations go with them. The form must therefore load the halves that exist.
 */
describe('readCourtSplit', () => {
  const parent = { id: 'p', name: 'Court 3', isSplitCourt: true, splitConfiguration: { splitInto: ['3a', '3b'], splitType: 'Pickleball' } };
  const halves = [
    { id: 'a', name: 'Court 3a', courtType: 'Pickleball', parentCourtId: 'p' },
    { id: 'b', name: 'Court 3b', courtType: 'Pickleball', parentCourtId: 'p' },
  ];

  it('reads the split from the child courts', () => {
    expect(readCourtSplit(parent, [parent, ...halves])).toEqual({ canSplit: true, splitNames: ['3a', '3b'], splitType: 'Pickleball' });
  });

  it('trusts the child courts over a stored configuration that has drifted', () => {
    const drifted = { ...parent, splitConfiguration: { splitNames: ['3a', '9z'], splitType: 'Pickleball' } };
    expect(readCourtSplit(drifted, [drifted, ...halves]).splitNames).toEqual(['3a', '3b']);
  });

  it('falls back to the stored configuration (either key, object or JSON text)', () => {
    expect(readCourtSplit(parent, [parent]).splitNames).toEqual(['3a', '3b']);
    const legacy = { id: 'q', name: 'Court 2', isSplitCourt: true, splitConfiguration: JSON.stringify({ splitNames: ['2A', '2B'], splitType: 'Tennis' }) };
    expect(readCourtSplit(legacy, [legacy])).toEqual({ canSplit: true, splitNames: ['2A', '2B'], splitType: 'Tennis' });
  });

  it('reports no split for an ordinary or new court', () => {
    expect(readCourtSplit({ id: 'x', name: 'Court 1' }, []).canSplit).toBe(false);
    expect(readCourtSplit(null, []).canSplit).toBe(false);
  });

  it('parses comma-separated split names', () => {
    expect(parseSplitNames(' 3a, 3b ,, ')).toEqual(['3a', '3b']);
  });
});

describe('facility operating hours', () => {
  it('reads the object form and keeps closed days', () => {
    const hours = readFacilityHours({ monday: { open: '07:00', close: '21:00', closed: false }, sunday: { open: '09:00', close: '18:00', closed: true } });
    expect(hours.monday).toEqual({ open: '07:00', close: '21:00', closed: false });
    expect(hours.sunday.closed).toBe(true);
    expect(hours.tuesday).toEqual(DEFAULT_FACILITY_HOURS.tuesday);
  });

  it('reads legacy string hours', () => {
    const hours = readFacilityHours({ monday: '06:00 - 22:00', tuesday: 'Closed' });
    expect(hours.monday).toEqual({ open: '06:00', close: '22:00', closed: false });
    expect(hours.tuesday.closed).toBe(true);
  });

  it('uses the defaults when nothing is saved', () => {
    expect(readFacilityHours(null)).toEqual(DEFAULT_FACILITY_HOURS);
  });

  it('rejects malformed or backwards times on open days only', () => {
    expect(validateFacilityHours(DEFAULT_FACILITY_HOURS)).toBeNull();
    expect(validateFacilityHours({ ...DEFAULT_FACILITY_HOURS, monday: { open: '8am', close: '20:00', closed: false } })).toMatch(/Monday/);
    expect(validateFacilityHours({ ...DEFAULT_FACILITY_HOURS, monday: { open: '20:00', close: '08:00', closed: false } })).toMatch(/after opening/);
    expect(validateFacilityHours({ ...DEFAULT_FACILITY_HOURS, monday: { open: '', close: '', closed: true } })).toBeNull();
  });
});
