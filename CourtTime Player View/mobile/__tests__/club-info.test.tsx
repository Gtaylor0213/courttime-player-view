import { describe, it, expect } from '@jest/globals';
import { getTodayHoursMessage } from '../src/components/OperatingHoursCard';
import { getOperatingHoursForDay, normalizeDayHours } from '../../shared/utils/operatingHours';

describe('Club info operating hours', () => {
  it('renders today open-hours using club-local timezone wording', () => {
    const operatingHours = {
      monday: { open: '09:00', close: '21:00' },
      tuesday: { open: '09:00', close: '21:00' },
      wednesday: { open: '09:00', close: '21:00' },
      thursday: { open: '09:00', close: '21:00' },
      friday: { open: '09:00', close: '21:00' },
      saturday: { open: '10:00', close: '18:00' },
      sunday: { closed: true },
    };

    const message = getTodayHoursMessage(
      operatingHours,
      'America/New_York',
      new Date('2026-05-04T15:00:00.000Z') // Monday EDT
    );
    expect(message).toBe('9:00 AM – 9:00 PM (club local time)');
  });

  it('shows closed today with next reopen day/time', () => {
    const operatingHours = {
      monday: { closed: true },
      tuesday: { open: '08:00', close: '22:00' },
      wednesday: { open: '08:00', close: '22:00' },
      thursday: { open: '08:00', close: '22:00' },
      friday: { open: '08:00', close: '22:00' },
      saturday: { open: '08:00', close: '22:00' },
      sunday: { open: '08:00', close: '22:00' },
    };

    const message = getTodayHoursMessage(
      operatingHours,
      'America/New_York',
      new Date('2026-05-04T15:00:00.000Z') // Monday EDT
    );
    expect(message).toBe('Closed today — reopens Tuesday at 8:00 AM.');

    expect(message).toContain('Closed today');
    expect(message).not.toContain('No open hours today');
  });

  it('handles legacy day keys and hour field aliases', () => {
    const operatingHours = {
      Mon: { open_time: '09:00', close_time: '21:00', is_closed: false },
      Tue: { open_time: '09:00', close_time: '21:00', is_closed: false },
      Wed: { open_time: '09:00', close_time: '21:00', is_closed: false },
      Thu: { open_time: '09:00', close_time: '21:00', is_closed: false },
      Fri: { open_time: '09:00', close_time: '21:00', is_closed: false },
      Sat: { open_time: '10:00', close_time: '18:00', is_closed: false },
      Sun: { open_time: '10:00', close_time: '18:00', is_closed: 'false' },
    };

    const message = getTodayHoursMessage(
      operatingHours as any,
      'America/New_York',
      new Date('2026-05-09T15:00:00.000Z') // Saturday EDT
    );

    expect(message).toBe('10:00 AM – 6:00 PM (club local time)');
  });

  it('treats string "false" on closed as open when times exist', () => {
    const operatingHours = {
      monday: { open: '09:00', close: '21:00', closed: 'false' },
      tuesday: { open: '09:00', close: '21:00', closed: 'false' },
      wednesday: { open: '09:00', close: '21:00', closed: 'false' },
      thursday: { open: '09:00', close: '21:00', closed: 'false' },
      friday: { open: '09:00', close: '21:00', closed: 'false' },
      saturday: { open: '10:00', close: '18:00', closed: 'false' },
      sunday: { open: '10:00', close: '18:00', closed: 'false' },
    };

    const message = getTodayHoursMessage(
      operatingHours as any,
      'America/New_York',
      new Date('2026-05-09T15:00:00.000Z') // Saturday EDT
    );
    expect(message).toBe('10:00 AM – 6:00 PM (club local time)');
  });

  it('prefers Monday-first numeric keys over JS weekday for Saturday/Sunday', () => {
    const operatingHours = {
      '5': { open: '10:00', close: '18:00' },
      '6': { open: '09:00', close: '17:00' },
    };
    const sat = normalizeDayHours(getOperatingHoursForDay(operatingHours, 'saturday'));
    const sun = normalizeDayHours(getOperatingHoursForDay(operatingHours, 'sunday'));
    expect(sat.closed).toBe(false);
    expect(sat.display).toContain('10:00');
    expect(sat.display).toContain('6:00');
    expect(sun.closed).toBe(false);
    expect(sun.display).toContain('9:00');
    expect(sun.display).toContain('5:00');
  });

  it('named keys beat numeric when both exist', () => {
    const operatingHours = {
      '6': { open: '01:00', close: '02:00' },
      saturday: { open: '10:00', close: '18:00' },
    };
    const sat = normalizeDayHours(getOperatingHoursForDay(operatingHours, 'saturday'));
    expect(sat.display).toContain('10:00');
    expect(sat.display).toContain('6:00');
  });
});
