import { describe, expect, it } from 'vitest';
import {
  buildCourtScheduleRowsFromFacilityOperatingHours,
  courtScheduleRowsToOperatingHoursMap,
  formatGroupedOperatingHoursSummary,
  normalizeCourtOperatingScheduleRows,
} from '../operatingHours';

/** Facility hours from registration Facility Info step */
const facilityHours = {
  monday: { open: '08:00', close: '20:00', closed: false },
  tuesday: { open: '08:00', close: '20:00', closed: false },
  wednesday: { open: '08:00', close: '20:00', closed: false },
  thursday: { open: '08:00', close: '20:00', closed: false },
  friday: { open: '08:00', close: '20:00', closed: false },
  saturday: { open: '09:00', close: '18:00', closed: false },
  sunday: { open: '09:00', close: '18:00', closed: true },
};

describe('registration → court management connection', () => {
  it('new courts default from facility hours (registration addCourt)', () => {
    const defaultSchedule = buildCourtScheduleRowsFromFacilityOperatingHours(facilityHours);
    expect(defaultSchedule).toHaveLength(7);
    expect(defaultSchedule.find((d) => d.day_of_week === 0)?.is_open).toBe(false); // Sunday closed
    expect(defaultSchedule.find((d) => d.day_of_week === 1)?.open_time).toBe('08:00');
  });

  it('per-court overrides persist through normalize (registerFacility → court_operating_config)', () => {
    const court1Default = buildCourtScheduleRowsFromFacilityOperatingHours(facilityHours);
    const court1Custom = court1Default.map((day) =>
      day.day_of_week === 1
        ? { ...day, open_time: '10:00', close_time: '22:00', prime_time_start: '17:00', prime_time_end: '20:00' }
        : day
    );

    const rows = normalizeCourtOperatingScheduleRows(court1Custom, facilityHours);
    const monday = rows.find((d) => d.day_of_week === 1);
    expect(monday?.open_time).toBe('10:00');
    expect(monday?.close_time).toBe('22:00');
    expect(monday?.prime_time_start).toBe('17:00');
    expect(monday?.prime_time_end).toBe('20:00');
  });

  it('court management list summary reads the same rows as GET /court-config schedule', () => {
    const court2Schedule = buildCourtScheduleRowsFromFacilityOperatingHours(facilityHours).map((day) =>
      day.day_of_week === 6
        ? { ...day, is_open: true, open_time: '07:00', close_time: '21:00' }
        : day
    );
    const rows = normalizeCourtOperatingScheduleRows(court2Schedule, facilityHours);
    const hoursMap = courtScheduleRowsToOperatingHoursMap(rows);
    const summary = formatGroupedOperatingHoursSummary(hoursMap);

    expect(summary).toContain('Sat');
    expect(summary.toLowerCase()).toMatch(/7am|07:00|7:00/);
  });

  it('two courts with different schedules stay independent after normalize', () => {
    const base = buildCourtScheduleRowsFromFacilityOperatingHours(facilityHours);
    const courtA = base.map((d) =>
      d.day_of_week === 2 ? { ...d, open_time: '06:00', close_time: '14:00' } : d
    );
    const courtB = base.map((d) =>
      d.day_of_week === 2 ? { ...d, open_time: '12:00', close_time: '23:00' } : d
    );

    const rowsA = normalizeCourtOperatingScheduleRows(courtA, facilityHours);
    const rowsB = normalizeCourtOperatingScheduleRows(courtB, facilityHours);

    expect(rowsA.find((d) => d.day_of_week === 2)?.open_time).toBe('06:00');
    expect(rowsB.find((d) => d.day_of_week === 2)?.open_time).toBe('12:00');
  });
});
