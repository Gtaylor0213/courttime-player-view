import { describe, it, expect } from '@jest/globals';
import { getTodayHoursMessage } from '../src/components/OperatingHoursCard';

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
});
