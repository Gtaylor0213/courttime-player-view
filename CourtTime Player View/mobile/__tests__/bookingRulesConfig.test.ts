import { describe, expect, it } from '@jest/globals';
import {
  buildBookingRulesPayload,
  hoursInputToMinutes,
  minutesToHoursInput,
  readBookingRulesForm,
  validateBookingRulesForm,
} from '../src/utils/bookingRulesForm';

/** The shape the server stores after a save from the web admin (nested + flat mirrors). */
const SAVED = {
  restrictionType: 'address',
  daysInAdvance: { enabled: true, limit: 7 },
  daysInAdvanceEnabled: true,
  advanceBookingDays: '7',
  maxReservationDuration: { enabled: true, limit: 120 },
  maxReservationDurationEnabled: true,
  maxReservationDurationMinutes: '120',
  maxReservationDurationByCourtType: { enabled: true, tennisMinutes: 120, pickleballMinutes: 90 },
  userLimits: {
    perWeekIndividual: { enabled: true, limit: 2 },
    perDayIndividual: { enabled: false, limit: 0 },
    perWeekHousehold: { enabled: true, limit: 5 },
    perDayHousehold: { enabled: false, limit: 0 },
  },
  courtsPerWeekUser: '2',
  courtsPerWeekUserEnabled: true,
  householdMaxMembersEnabled: true,
  householdMaxMembers: '4',
  hasPeakHours: true,
  peakHoursSlots: [{ id: 'a', startTime: '17:00', endTime: '20:00', days: [1, 2], rules: { maxBookingsPerWeek: -1, maxDurationHours: '1.5' } }],
  weekendPolicy: { maxBookingsPerWeekend: '2' },
};

describe('booking rules form', () => {
  it('reads the saved rules the way the web admin form does', () => {
    const form = readBookingRulesForm({ generalRules: 'Be nice', bookingRules: JSON.stringify(SAVED) });
    expect(form.generalRules).toBe('Be nice');
    expect(form.restrictionType).toBe('address');
    expect(form.daysInAdvanceEnabled).toBe(true);
    expect(form.daysInAdvance).toBe('7');
    expect(form.maxReservationDurationEnabled).toBe(true);
    expect(form.maxReservationDurationMinutes).toBe('120');
    expect(form.maxReservationDurationByCourtTypeEnabled).toBe(true);
    expect(form.maxReservationDurationPickleballMinutes).toBe('90');
    expect(form.courtsPerWeekUserEnabled).toBe(true);
    expect(form.courtsPerWeekUser).toBe('2');
    expect(form.courtsPerDayUserEnabled).toBe(false);
    expect(form.courtsPerWeekHouseholdEnabled).toBe(true);
    expect(form.courtsPerWeekHousehold).toBe('5');
    expect(form.householdMaxMembers).toBe('4');
    expect(form.hasPeakHours).toBe(true);
    expect(form.peakHoursSlots[0].rules.maxBookingsPerWeekUnlimited).toBe(true);
    expect(form.peakHoursSlots[0].rules.maxBookingsPerWeek).toBe('2');
    expect(form.peakHoursSlots[0].rules.maxBookingsPerDayUnlimited).toBe(false);
  });

  it('starts everything off for a club with no saved rules', () => {
    const form = readBookingRulesForm({ bookingRules: null });
    expect(form.restrictionType).toBe('account');
    expect(form.daysInAdvanceEnabled).toBe(false);
    expect(form.maxReservationDurationEnabled).toBe(false);
    expect(form.courtsPerWeekUserEnabled).toBe(false);
    expect(form.hasPeakHours).toBe(false);
    expect(form.peakHoursSlots).toEqual([]);
  });

  it('reads legacy hour-based duration keys as minutes', () => {
    const form = readBookingRulesForm({ bookingRules: { maxBookingDurationHours: '1.5', maxBookingDurationUnlimited: false } });
    expect(form.maxReservationDurationEnabled).toBe(true);
    expect(form.maxReservationDurationMinutes).toBe('90');
  });

  it('builds the save payload: saved settings carried through, form on top, legacy aliases aligned', () => {
    const form = { ...readBookingRulesForm({ bookingRules: SAVED }), daysInAdvance: '10', courtsPerWeekUser: '3' };
    const payload = buildBookingRulesPayload(SAVED, form);
    // The server reads the flat value; the nested object must not survive in this key.
    expect(payload.daysInAdvance).toBe('10');
    expect(payload.advanceBookingDays).toBe('10');
    expect(payload.advanceBookingDaysUnlimited).toBe(false);
    expect(payload.courtsPerWeekUser).toBe('3');
    expect(payload.maxBookingsPerWeek).toBe('3');
    expect(payload.maxBookingsPerWeekUnlimited).toBe(false);
    expect(payload.restrictionsApplyToAdmins).toBe(false);
    // Settings this screen does not show are not dropped.
    expect(payload.weekendPolicy).toEqual(SAVED.weekendPolicy);
    expect(payload.userLimits).toEqual(SAVED.userLimits);
  });

  it('requires 1 to 365 days in advance when that rule is on', () => {
    const base = readBookingRulesForm({ bookingRules: SAVED });
    expect(validateBookingRulesForm(base)).toBeNull();
    expect(validateBookingRulesForm({ ...base, daysInAdvance: '' })).toMatch(/1 to 365/);
    expect(validateBookingRulesForm({ ...base, daysInAdvance: '400' })).toMatch(/1 to 365/);
    expect(validateBookingRulesForm({ ...base, daysInAdvance: '', daysInAdvanceEnabled: false })).toBeNull();
  });

  it('converts between the hours field and stored minutes', () => {
    expect(minutesToHoursInput('90')).toBe('1.5');
    expect(minutesToHoursInput('')).toBe('');
    expect(hoursInputToMinutes('1.5')).toBe('90');
    expect(hoursInputToMinutes('')).toBe('0');
  });
});
