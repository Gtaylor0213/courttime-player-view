import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const validateBookingMock = vi.fn();
const isFacilityAdminMock = vi.fn();
const notifyCancelledMock = vi.fn();
const sendCancellationEmailMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: (...args: unknown[]) => clientQueryMock(...args) }),
}));

vi.mock('../bookingService', () => ({
  validateBooking: (...args: unknown[]) => validateBookingMock(...args),
}));

vi.mock('../memberService', () => ({
  isFacilityAdmin: (...args: unknown[]) => isFacilityAdminMock(...args),
}));

vi.mock('../notificationService', () => ({
  notificationService: {
    notifyBookingCancelled: (...args: unknown[]) => notifyCancelledMock(...args),
  },
}));

vi.mock('../emailService', () => ({
  sendBookingCancellationEmail: (...args: unknown[]) => sendCancellationEmailMock(...args),
}));

import { updateBookingSeries, cancelBookingSeries, getBookingSeries } from '../bookingSeriesService';

const OWNER = 'user-1';
const SERIES_ID = 'series-1';
const DATES = ['2099-09-21', '2099-09-23', '2099-09-28', '2099-09-30', '2099-10-05'];

const seriesRow = {
  id: SERIES_ID,
  facilityId: 'fac-1',
  createdBy: OWNER,
  userId: OWNER,
  bookedByStaffId: null,
  walkInName: null,
  courtIds: ['court-a'],
  weekdays: [1, 3],
  startDate: '2099-09-21',
  endDate: '2099-10-05',
  startTime: '18:00:00',
  endTime: '19:30:00',
  durationMinutes: 90,
  bookingType: 'Match',
  notes: 'league night',
  maxPlayers: null,
  status: 'active',
  ownerName: 'Pat Owner',
};

const instanceRows = DATES.map((d) => ({
  id: `b-${d}`,
  courtId: 'court-a',
  bookingDate: d,
  startTime: '18:00:00',
  endTime: '19:30:00',
  durationMinutes: 90,
  status: 'confirmed',
  courtName: 'Court A',
}));

/** getBookingSeries issues the series query then the instances query. */
function mockSeriesLoad(rows = instanceRows) {
  queryMock
    .mockResolvedValueOnce({ rows: [seriesRow] })
    .mockResolvedValueOnce({ rows });
}

/** Court lock, then a free/busy answer for each slot the edit touches. */
function mockTransaction({ freeSlots = true }: { freeSlots?: boolean } = {}) {
  clientQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM courts')) {
      return { rows: [{ id: 'court-a', name: 'Court A' }, { id: 'court-b', name: 'Court B' }] };
    }
    if (sql.includes('check_split_court_availability')) {
      return { rows: [{ available: freeSlots }] };
    }
    if (sql.includes('SELECT id FROM bookings')) {
      return { rows: freeSlots ? [] : [{ id: 'other-booking' }] };
    }
    if (sql.includes('RETURNING id, user_id')) {
      return { rows: [] };
    }
    return { rows: [], rowCount: 0 };
  });
}

const baseRule = {
  userId: OWNER,
  courtIds: ['court-a'],
  weekdays: [1, 3],
  startDate: '2099-09-21',
  endDate: '2099-10-05',
  startTime: '18:00:00',
  endTime: '19:30:00',
  durationMinutes: 90,
  bookingType: 'Match',
  notes: 'league night',
};

describe('getBookingSeries', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns the rule and its instances', async () => {
    mockSeriesLoad();
    const series = await getBookingSeries(SERIES_ID);
    expect(series?.rule.weekdays).toEqual([1, 3]);
    expect(series?.rule.courtIds).toEqual(['court-a']);
    expect(series?.instances).toHaveLength(5);
  });

  it('returns null for an unknown series', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getBookingSeries('nope')).toBeNull();
  });
});

describe('updateBookingSeries', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
    validateBookingMock.mockReset();
    isFacilityAdminMock.mockReset();
    notifyCancelledMock.mockReset();
    sendCancellationEmailMock.mockReset();
    validateBookingMock.mockResolvedValue({ allowed: true, blockers: [], warnings: [] });
    isFacilityAdminMock.mockResolvedValue(false);
    notifyCancelledMock.mockResolvedValue('notif-1');
    sendCancellationEmailMock.mockResolvedValue(true);
  });

  it('refuses someone who neither owns nor administers the series', async () => {
    mockSeriesLoad();
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: 'stranger',
      scope: 'all',
      rule: baseRule,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not authorized/);
  });

  it('lets a facility admin edit a series they do not own', async () => {
    mockSeriesLoad();
    isFacilityAdminMock.mockResolvedValue(true);
    mockTransaction();
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: 'admin-9',
      scope: 'all',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
      skipRulesValidation: true,
    });
    expect(result.success).toBe(true);
    expect(result.updated).toBe(5);
  });

  it('rejects an empty court list, empty weekdays and an inverted range', async () => {
    for (const bad of [
      { courtIds: [] },
      { weekdays: [] },
      { startDate: '2099-10-05', endDate: '2099-09-21' },
      { durationMinutes: 0 },
    ]) {
      mockSeriesLoad();
      const result = await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'all',
        rule: { ...baseRule, ...bad },
      });
      expect(result.success).toBe(false);
    }
  });

  it('moving the time reshapes every instance and writes the rule back', async () => {
    mockSeriesLoad();
    mockTransaction();
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(5);
    expect(result.created).toBe(0);
    expect(result.cancelled).toBe(0);

    const ruleWrite = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE booking_series')
    );
    expect(ruleWrite?.[1]).toContain('19:00:00');
  });

  it('extending the end date inserts the new dates only', async () => {
    mockSeriesLoad();
    mockTransaction();
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, endDate: '2099-10-12' },
    });
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.cancelled).toBe(0);
  });

  it('a conflict rolls the whole edit back and reports every clashing date', async () => {
    mockSeriesLoad();
    mockTransaction({ freeSlots: false });
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
    });

    expect(result.success).toBe(false);
    expect(result.conflicts).toHaveLength(5);
    expect(result.conflicts?.[0].courtName).toBe('Court A');
    // Nothing was written: no UPDATE bookings statement ran.
    expect(
      clientQueryMock.mock.calls.some(([sql]) => String(sql).includes('UPDATE bookings\n           SET court_id'))
    ).toBe(false);
  });

  it('skipConflicts applies the dates that are free and leaves the rest', async () => {
    mockSeriesLoad();
    let slot = 0;
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM courts')) return { rows: [{ id: 'court-a', name: 'Court A' }] };
      if (sql.includes('SELECT id FROM bookings')) {
        // The third slot checked is taken.
        slot += 1;
        return { rows: slot === 3 ? [{ id: 'other' }] : [] };
      }
      if (sql.includes('check_split_court_availability')) return { rows: [{ available: true }] };
      return { rows: [], rowCount: 0 };
    });

    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
      skipConflicts: true,
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(4);
  });

  it('blocks a member edit that fails the facility booking rules', async () => {
    mockSeriesLoad();
    mockTransaction();
    validateBookingMock.mockResolvedValue({
      allowed: false,
      blockers: [{ message: 'Weekly booking limit reached' }],
      warnings: [],
    });

    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, endDate: '2099-10-12' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Weekly booking limit reached');
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('excludes the booking being reshaped from its own quota check', async () => {
    mockSeriesLoad();
    mockTransaction();
    await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
    });
    expect(validateBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ excludeBookingId: 'b-2099-09-21' })
    );
  });

  it("'following' splits the series and truncates the original rule", async () => {
    mockSeriesLoad();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM courts')) return { rows: [{ id: 'court-a', name: 'Court A' }] };
      if (sql.includes('check_split_court_availability')) return { rows: [{ available: true }] };
      if (sql.includes('SELECT id FROM bookings')) return { rows: [] };
      if (sql.includes('INSERT INTO booking_series')) return { rows: [{ id: 'series-2' }] };
      return { rows: [], rowCount: 0 };
    });

    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'following',
      fromDate: '2099-09-28',
      rule: { ...baseRule, startTime: '19:00:00', endTime: '20:30:00' },
    });

    expect(result.success).toBe(true);
    expect(result.newSeriesId).toBe('series-2');
    expect(result.updated).toBe(3);

    const truncate = clientQueryMock.mock.calls.find(
      ([sql]) => String(sql).includes('UPDATE booking_series SET end_date')
    );
    expect(truncate?.[1]).toEqual([SERIES_ID, '2099-09-27']);

    const reassign = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('SET series_id = $1')
    );
    expect(reassign?.[1]).toEqual(['series-2', SERIES_ID, '2099-09-28']);
  });

  describe("'instance' scope", () => {
    it('reshapes only the named bookings and never rewrites the rule', async () => {
      mockSeriesLoad();
      mockTransaction();
      const result = await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'instance',
        bookingIds: ['b-2099-09-23'],
        rule: { ...baseRule, startTime: '20:00:00', endTime: '21:30:00' },
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.cancelled).toBe(0);
      expect(result.created).toBe(0);
      // The series rule must survive a one-off date edit untouched.
      expect(
        clientQueryMock.mock.calls.some(([sql]) =>
          String(sql).includes('UPDATE booking_series\n           SET user_id')
        )
      ).toBe(false);
    });

    it('moves a single selected date to a new date', async () => {
      mockSeriesLoad();
      mockTransaction();
      await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'instance',
        bookingIds: ['b-2099-09-23'],
        rule: { ...baseRule, startDate: '2099-09-24', endDate: '2099-09-24' },
      });
      const reshape = clientQueryMock.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE bookings\n           SET court_id')
      );
      expect(reshape?.[1]).toContain('2099-09-24');
    });

    it('keeps each date where it is when several are selected', async () => {
      mockSeriesLoad();
      mockTransaction();
      await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'instance',
        bookingIds: ['b-2099-09-23', 'b-2099-09-28'],
        rule: { ...baseRule, startDate: '2099-09-24', endDate: '2099-09-24' },
      });
      const reshapes = clientQueryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('UPDATE bookings\n           SET court_id')
      );
      expect(reshapes.map((call) => call[1][2])).toEqual(['2099-09-23', '2099-09-28']);
    });

    it('requires at least one booking id', async () => {
      mockSeriesLoad();
      const result = await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'instance',
        rule: baseRule,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at least one date/i);
    });

    it('rejects a booking id from another series', async () => {
      mockSeriesLoad();
      const result = await updateBookingSeries({
        seriesId: SERIES_ID,
        actorUserId: OWNER,
        scope: 'instance',
        bookingIds: ['someone-elses-booking'],
        rule: baseRule,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not part of this recurring reservation/i);
    });
  });

  it("'following' requires the date it starts from", async () => {
    mockSeriesLoad();
    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'following',
      rule: baseRule,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/start date is required/i);
  });

  it('unchecking a date cancels it and notifies the member', async () => {
    mockSeriesLoad();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM courts')) return { rows: [{ id: 'court-a', name: 'Court A' }] };
      if (sql.includes('check_split_court_availability')) return { rows: [{ available: true }] };
      if (sql.includes('SELECT id FROM bookings')) return { rows: [] };
      if (sql.includes('RETURNING id, user_id')) {
        return {
          rows: [
            {
              id: 'b-2099-09-28',
              userId: OWNER,
              courtId: 'court-a',
              bookingDate: '2099-09-28',
              startTime: '18:00:00',
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    });
    queryMock
      .mockResolvedValueOnce({ rows: [{ name: 'Test Club' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'court-a', name: 'Court A' }] })
      .mockResolvedValueOnce({ rows: [{ id: OWNER, email: 'a@b.com', fullName: 'Pat Owner' }] });

    const result = await updateBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
      rule: baseRule,
      excludeDates: ['2099-09-28'],
    });

    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(1);
    expect(notifyCancelledMock).toHaveBeenCalledTimes(1);
    expect(sendCancellationEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe('cancelBookingSeries', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
    isFacilityAdminMock.mockReset();
    notifyCancelledMock.mockReset();
    sendCancellationEmailMock.mockReset();
    isFacilityAdminMock.mockResolvedValue(false);
    notifyCancelledMock.mockResolvedValue('notif-1');
    sendCancellationEmailMock.mockResolvedValue(true);
    clientQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('cancels every upcoming instance at "all" scope', async () => {
    mockSeriesLoad();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('RETURNING id, user_id')) {
        return { rows: instanceRows.map((i) => ({ ...i, userId: OWNER })) };
      }
      return { rows: [], rowCount: 0 };
    });
    // Lookups notifyCancelledInstances makes after the commit.
    queryMock
      .mockResolvedValueOnce({ rows: [{ name: 'Test Club' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'court-a', name: 'Court A' }] })
      .mockResolvedValueOnce({ rows: [{ id: OWNER, email: 'a@b.com', fullName: 'Pat Owner' }] });

    const result = await cancelBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
    });

    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(5);
    expect(notifyCancelledMock).toHaveBeenCalledTimes(5);
    expect(sendCancellationEmailMock).toHaveBeenCalledTimes(5);
    const update = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'cancelled'")
    );
    expect(update?.[1][0]).toEqual(DATES.map((d) => `b-${d}`));
  });

  it('cancels only the chosen dates at "instance" scope', async () => {
    mockSeriesLoad();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('RETURNING id, user_id')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });

    await cancelBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'instance',
      bookingIds: ['b-2099-09-23'],
    });

    const update = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'cancelled'")
    );
    expect(update?.[1][0]).toEqual(['b-2099-09-23']);
  });

  it('cancels from a date onward and truncates the rule at "following" scope', async () => {
    mockSeriesLoad();
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('RETURNING id, user_id')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });

    await cancelBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'following',
      fromDate: '2099-09-30',
    });

    const update = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'cancelled'")
    );
    expect(update?.[1][0]).toEqual(['b-2099-09-30', 'b-2099-10-05']);

    const truncate = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE booking_series SET end_date')
    );
    expect(truncate?.[1]).toEqual([SERIES_ID, '2099-09-29']);
  });

  it('refuses an unauthorized caller', async () => {
    mockSeriesLoad();
    const result = await cancelBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: 'stranger',
      scope: 'all',
    });
    expect(result.success).toBe(false);
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('says so when nothing upcoming is left', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [seriesRow] })
      .mockResolvedValueOnce({
        rows: instanceRows.map((i) => ({ ...i, status: 'cancelled' })),
      });
    const result = await cancelBookingSeries({
      seriesId: SERIES_ID,
      actorUserId: OWNER,
      scope: 'all',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no upcoming dates/i);
  });
});
