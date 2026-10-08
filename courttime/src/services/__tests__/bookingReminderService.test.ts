import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const notifyBookingReminderMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../notificationService', () => ({
  notificationService: {
    notifyBookingReminder: (...args: unknown[]) => notifyBookingReminderMock(...args),
  },
}));

import { REMINDER_LEAD_MINUTES, sendDueBookingReminders } from '../bookingReminderService';

function booking(overrides: Record<string, unknown> = {}) {
  return {
    bookingId: 'b1',
    userId: 'u1',
    facilityId: 'club-1',
    courtId: 'c1',
    bookingDate: '2026-10-09',
    startTimeLabel: '6:00 PM',
    courtName: 'Court 1',
    facilityName: 'Club One',
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  notifyBookingReminderMock.mockReset();
  notifyBookingReminderMock.mockResolvedValue('n1');
});

describe('sendDueBookingReminders', () => {
  it('claims due bookings in one statement and sends nothing when none are due', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await sendDueBookingReminders()).toBe(0);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    // Selecting and marking happen together, so two instances can't both send.
    expect(sql).toContain('FOR UPDATE OF b SKIP LOCKED');
    expect(sql).toContain('SET reminder_sent_at = CURRENT_TIMESTAMP');
    expect(sql).toContain('b.reminder_sent_at IS NULL');
    expect(sql).toContain("b.status = 'confirmed'");
    expect(params[1]).toBe(REMINDER_LEAD_MINUTES);
    expect(notifyBookingReminderMock).not.toHaveBeenCalled();
  });

  it('leaves out walk-ins, event and padel holds, maintenance and deleted accounts', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await sendDueBookingReminders();
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toContain('b.walk_in_name IS NULL');
    expect(sql).toContain('b.bulletin_post_id IS NULL');
    expect(sql).toContain('b.padel_session_id IS NULL');
    expect(sql).toContain("NOT IN ('maintenance', 'blocked')");
    expect(sql).toContain('u.deleted_at IS NULL');
  });

  it('leaves out members running a full schedule of bookings that day', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await sendDueBookingReminders();
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('d.booking_date = b.booking_date');
    expect(params[3]).toBe(4);
  });

  it('reads the start time in the facility timezone', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await sendDueBookingReminders();
    expect(queryMock.mock.calls[0][0]).toContain("AT TIME ZONE COALESCE(NULLIF(f.timezone, ''), 'America/New_York')");
  });

  it('sends one reminder per booking with the court, club and start time', async () => {
    queryMock.mockResolvedValue({ rows: [booking(), booking({ bookingId: 'b2', userId: 'u2', courtName: 'Court 2' })] });
    expect(await sendDueBookingReminders()).toBe(2);
    expect(notifyBookingReminderMock.mock.calls[0]).toEqual([
      'u1',
      'Club One',
      'Court 1',
      '6:00 PM',
      { bookingId: 'b1', facilityId: 'club-1', bookingDate: '2026-10-09', courtId: 'c1' },
    ]);
    expect(notifyBookingReminderMock.mock.calls[1][0]).toBe('u2');
  });

  it('sends a single reminder to someone holding several courts at the same time', async () => {
    queryMock.mockResolvedValue({
      rows: [
        booking(),
        booking({ bookingId: 'b2', courtId: 'c2', courtName: 'Court 2' }),
        booking({ bookingId: 'b3', courtId: 'c3', courtName: 'Court 3' }),
        // Same member, later start: its own reminder.
        booking({ bookingId: 'b4', startTimeLabel: '6:30 PM' }),
      ],
    });
    expect(await sendDueBookingReminders()).toBe(2);
    expect(notifyBookingReminderMock.mock.calls[0][2]).toBe('3 courts');
    expect(notifyBookingReminderMock.mock.calls[1][2]).toBe('Court 1');
  });

  it('keeps going when one notification fails', async () => {
    queryMock.mockResolvedValue({ rows: [booking(), booking({ bookingId: 'b2', userId: 'u2' })] });
    notifyBookingReminderMock.mockRejectedValueOnce(new Error('push down'));
    expect(await sendDueBookingReminders()).toBe(1);
    expect(notifyBookingReminderMock).toHaveBeenCalledTimes(2);
  });
});
