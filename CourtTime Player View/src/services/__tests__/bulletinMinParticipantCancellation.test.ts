import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const sendEmailMock = vi.fn();
const refundMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../emailService', () => ({
  sendBulletinMinParticipantsNotMetEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('../stripeConnectService', () => ({
  refundBulletinSignupPaymentsForPost: (...args: unknown[]) => refundMock(...args),
}));

import { processBulletinMinParticipantCancellations } from '../bulletinBoardService';

describe('processBulletinMinParticipantCancellations', () => {
  beforeEach(() => {
    queryMock.mockReset();
    sendEmailMock.mockReset();
    refundMock.mockReset();
    sendEmailMock.mockResolvedValue({ success: true, status: 200 });
    refundMock.mockResolvedValue({ refunded: 0, skipped: 0, failed: 0 });
  });

  it('returns 0 when no events are due for cancellation', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const count = await processBulletinMinParticipantCancellations();

    expect(count).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('only considers confirmed signups in the due-post query', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await processBulletinMinParticipantCancellations();

    const dueSql = String(queryMock.mock.calls[0][0]);
    expect(dueSql).toContain("bds.status = 'confirmed'");
    expect(dueSql).toContain('cancel_if_min_not_met');
    expect(dueSql).toContain('cancellation_notified_at IS NULL');
  });

  it('emails confirmed participants, refunds signups, and marks the post cancelled', async () => {
    const postId = 'post-1';
    const drillStartAt = new Date('2026-05-20T18:00:00Z').toISOString();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: postId,
            title: 'Friday Drill',
            category: 'drill',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            drillStartAt,
            minParticipants: 4,
            registeredParticipants: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            userId: 'user-a',
            email: 'a@club.com',
            fullName: 'Player A',
          },
          {
            userId: 'user-b',
            email: 'b@club.com',
            fullName: 'Player B',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ bookingId: null }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    refundMock.mockResolvedValueOnce({ refunded: 1, skipped: 0, failed: 0 });

    const count = await processBulletinMinParticipantCancellations();

    expect(count).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(
      'a@club.com',
      'Player A',
      'Sunset Tennis',
      'Friday Drill',
      'Drill',
      expect.any(String),
      4,
      2,
      'user-a'
    );
    expect(refundMock).toHaveBeenCalledWith(postId);

    const participantSql = String(queryMock.mock.calls[1][0]);
    expect(participantSql).toContain("bds.status = 'confirmed'");

    const cancelSql = String(queryMock.mock.calls[3][0]);
    expect(cancelSql).toContain("status = 'cancelled'");
    expect(cancelSql).toContain('cancellation_notified_at');
    expect(queryMock.mock.calls[3][1]).toEqual([postId]);
  });

  it('cancels the associated court booking when one exists', async () => {
    const postId = 'post-2';
    const drillStartAt = new Date('2026-05-21T10:00:00Z').toISOString();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: postId,
            title: 'Saturday Clinic',
            category: 'clinic',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            drillStartAt,
            minParticipants: 3,
            registeredParticipants: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ userId: 'user-c', email: 'c@club.com', fullName: 'Player C' }] })
      .mockResolvedValueOnce({ rows: [{ bookingId: 'booking-99' }] }) // cancelBulletinCourtBooking SELECT
      .mockResolvedValueOnce({ rowCount: 1 })                         // UPDATE bookings
      .mockResolvedValueOnce({ rowCount: 1 });                        // UPDATE bulletin_posts

    const count = await processBulletinMinParticipantCancellations();

    expect(count).toBe(1);

    const bookingCancelSql = String(queryMock.mock.calls[3][0]);
    expect(bookingCancelSql).toContain('UPDATE bookings');
    expect(bookingCancelSql).toContain("status = 'cancelled'");
    expect(queryMock.mock.calls[3][1]).toEqual(['booking-99']);

    const postCancelSql = String(queryMock.mock.calls[4][0]);
    expect(postCancelSql).toContain('UPDATE bulletin_posts');
    expect(postCancelSql).toContain('cancellation_notified_at');
  });

  it('marks the post cancelled with no emails when there are zero confirmed participants', async () => {
    const postId = 'post-3';
    const drillStartAt = new Date('2026-05-22T14:00:00Z').toISOString();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: postId,
            title: 'Empty Event',
            category: 'event',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            drillStartAt,
            minParticipants: 2,
            registeredParticipants: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })                  // no participants
      .mockResolvedValueOnce({ rows: [{ bookingId: null }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const count = await processBulletinMinParticipantCancellations();

    expect(count).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const postCancelSql = String(queryMock.mock.calls[3][0]);
    expect(postCancelSql).toContain("status = 'cancelled'");
    expect(postCancelSql).toContain('cancellation_notified_at');
  });

  it('processes multiple due posts and returns the correct count', async () => {
    const drillStartAt = new Date('2026-05-23T09:00:00Z').toISOString();
    const makePost = (id: string) => ({
      id,
      title: `Post ${id}`,
      category: 'drill',
      facilityId: 'fac-1',
      facilityName: 'Sunset Tennis',
      drillStartAt,
      minParticipants: 4,
      registeredParticipants: 1,
    });

    queryMock
      .mockResolvedValueOnce({ rows: [makePost('p1'), makePost('p2')] })
      // post p1
      .mockResolvedValueOnce({ rows: [{ userId: 'u1', email: '1@club.com', fullName: 'One' }] })
      .mockResolvedValueOnce({ rows: [{ bookingId: null }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      // post p2
      .mockResolvedValueOnce({ rows: [{ userId: 'u2', email: '2@club.com', fullName: 'Two' }] })
      .mockResolvedValueOnce({ rows: [{ bookingId: null }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const count = await processBulletinMinParticipantCancellations();

    expect(count).toBe(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(refundMock).toHaveBeenCalledTimes(2);
    expect(refundMock).toHaveBeenCalledWith('p1');
    expect(refundMock).toHaveBeenCalledWith('p2');
  });
});
