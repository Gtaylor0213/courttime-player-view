import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const txClientQueryMock = vi.fn();
const transactionMock = vi.fn(async (callback: (client: { query: typeof txClientQueryMock }) => unknown) =>
  callback({ query: txClientQueryMock })
);
const createBookingMock = vi.fn();
const isFeatureEnabledMock = vi.fn();
const loadCourtPaymentSettingsMock = vi.fn();
const courtBookingNeedsPaymentMock = vi.fn();
const createSplitCourtPaymentCheckoutSessionMock = vi.fn();
const refundSplitPaymentSharesMock = vi.fn();
const refundSplitShareDifferenceMock = vi.fn();
const createNotificationMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...(args as [never])),
}));
vi.mock('../bookingService', () => ({
  createBooking: (...args: unknown[]) => createBookingMock(...args),
}));
vi.mock('../featureFlagService', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabledMock(...args),
}));
vi.mock('../courtPaymentSettings', () => ({
  loadCourtPaymentSettings: (...args: unknown[]) => loadCourtPaymentSettingsMock(...args),
  courtBookingNeedsPayment: (...args: unknown[]) => courtBookingNeedsPaymentMock(...args),
}));
vi.mock('../stripeConnectService', () => ({
  createSplitCourtPaymentCheckoutSession: (...args: unknown[]) => createSplitCourtPaymentCheckoutSessionMock(...args),
  refundSplitPaymentShares: (...args: unknown[]) => refundSplitPaymentSharesMock(...args),
  refundSplitShareDifference: (...args: unknown[]) => refundSplitShareDifferenceMock(...args),
}));
vi.mock('../notificationService', () => ({
  notificationService: { createNotification: (...args: unknown[]) => createNotificationMock(...args) },
}));

import {
  createSplitCourtReservation,
  declineSplitPayment,
  expireSplitCourtReservations,
  updateSplitPaymentParticipants,
} from '../splitCourtPaymentService';

describe('createSplitCourtReservation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    txClientQueryMock.mockReset();
    transactionMock.mockClear();
    createBookingMock.mockReset();
    isFeatureEnabledMock.mockReset().mockResolvedValue(true);
    loadCourtPaymentSettingsMock.mockReset().mockResolvedValue({ booking_amount_cents: 6000 });
    courtBookingNeedsPaymentMock.mockReset().mockReturnValue(true);
    createSplitCourtPaymentCheckoutSessionMock.mockReset().mockResolvedValue({ url: 'https://stripe.example/checkout' });
    refundSplitPaymentSharesMock.mockReset();
    createNotificationMock.mockReset().mockResolvedValue('notif-id');
  });

  const baseParams = {
    courtId: 'court-1',
    userId: 'owner-1',
    facilityId: 'facility-1',
    bookingDate: '2026-08-01',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
  };

  it('rejects more than 4 total participants before touching the database', async () => {
    await expect(
      createSplitCourtReservation({ ...baseParams, participantIds: ['p1', 'p2', 'p3', 'p4'] })
    ).rejects.toThrow(/at most 4 people/);

    expect(queryMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it('inserts the booking directly as pending/split (atomic — never briefly confirmed) and charges the organizer immediately', async () => {
    // membership check: owner + 2 participants all active
    queryMock
      .mockResolvedValueOnce({ rows: [{ user_id: 'owner-1' }, { user_id: 'p1' }, { user_id: 'p2' }] }) // facility_memberships
      .mockResolvedValueOnce({ rows: [{ courtName: 'Court 1', facilityName: 'Test Club' }] }); // loadBookingNoticeDetails

    createBookingMock.mockResolvedValue({ success: true, booking: { id: 'booking-1', status: 'pending' } });
    txClientQueryMock
      .mockResolvedValueOnce({ rows: [] }) // insert participant owner-1
      .mockResolvedValueOnce({ rows: [{ id: 'share-owner' }] }) // insert share owner-1
      .mockResolvedValueOnce({ rows: [] }) // insert participant p1
      .mockResolvedValueOnce({ rows: [{ id: 'share-p1' }] })
      .mockResolvedValueOnce({ rows: [] }) // insert participant p2
      .mockResolvedValueOnce({ rows: [{ id: 'share-p2' }] });

    const result = await createSplitCourtReservation({ ...baseParams, participantIds: ['p1', 'p2'] });

    expect(createBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStatus: 'pending',
        paymentMode: 'split',
        skipPaymentCheck: true,
      })
    );
    // Never inserted as 'confirmed' at any point — no separate "flip to pending" step exists.
    expect(createBookingMock.mock.calls[0][0]).not.toHaveProperty('initialStatus', 'confirmed');

    // Organizer is charged immediately, exactly like a normal paid booking.
    expect(result.requiresPayment).toBe(true);
    expect(result.checkoutUrl).toBe('https://stripe.example/checkout');
    expect(createSplitCourtPaymentCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'booking-1', shareId: 'share-owner', memberId: 'owner-1' })
    );

    // Invited members (not the organizer) get notified to pay their own share.
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    const notifiedUserIds = createNotificationMock.mock.calls.map((call) => call[0]);
    expect(notifiedUserIds.sort()).toEqual(['p1', 'p2']);
  });

  it('rejects when fewer than 2 total participants', async () => {
    await expect(
      createSplitCourtReservation({ ...baseParams, participantIds: [] })
    ).rejects.toThrow(/at least one other member/);
  });
});

describe('declineSplitPayment', () => {
  beforeEach(() => {
    queryMock.mockReset();
    txClientQueryMock.mockReset();
    transactionMock.mockClear();
    refundSplitPaymentSharesMock.mockReset().mockResolvedValue({ refunded: 1, skipped: 0, failed: 0 });
    createNotificationMock.mockReset().mockResolvedValue('notif-id');
  });

  it('cancels the whole booking, refunds paid shares, and notifies everyone but the decliner', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'share-2', shareStatus: 'pending', bookingStatus: 'pending' }] }) // decliner's own share lookup
      .mockResolvedValueOnce({ // notifySplitBookingCancelled participant lookup
        rows: [
          { userId: 'owner-1', courtName: 'Court 1', facilityName: 'Test Club' },
          { userId: 'p1', courtName: 'Court 1', facilityName: 'Test Club' },
          { userId: 'p2', courtName: 'Court 1', facilityName: 'Test Club' },
        ],
      });

    await declineSplitPayment('booking-1', 'p2', 'Can\'t make it');

    expect(txClientQueryMock).toHaveBeenCalledWith(expect.stringContaining("status = 'declined'"), ['share-2', "Can't make it"]);
    expect(txClientQueryMock).toHaveBeenCalledWith(expect.stringContaining("bookings SET status = 'cancelled'"), ['booking-1']);
    expect(refundSplitPaymentSharesMock).toHaveBeenCalledWith('booking-1');

    // The decliner (p2) already knows — only owner-1 and p1 get notified.
    const notifiedUserIds = createNotificationMock.mock.calls.map((call) => call[0]);
    expect(notifiedUserIds.sort()).toEqual(['owner-1', 'p1']);
  });

  it('rejects declining a share that has already been resolved', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'share-2', shareStatus: 'paid', bookingStatus: 'pending' }] });

    await expect(declineSplitPayment('booking-1', 'p2')).rejects.toThrow(/already been resolved/);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(refundSplitPaymentSharesMock).not.toHaveBeenCalled();
  });
});

describe('expireSplitCourtReservations', () => {
  beforeEach(() => {
    queryMock.mockReset();
    txClientQueryMock.mockReset();
    transactionMock.mockClear();
    refundSplitPaymentSharesMock.mockReset().mockResolvedValue({ refunded: 1, skipped: 0, failed: 0 });
    createNotificationMock.mockReset().mockResolvedValue('notif-id');
  });

  it('refunds already-paid shares for every expired booking and notifies participants (the money-leak fix)', async () => {
    txClientQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1' }] }) // UPDATE bookings ... RETURNING id
      .mockResolvedValueOnce({ rows: [] }); // UPDATE booking_payment_shares (pending -> cancelled)
    queryMock.mockResolvedValueOnce({
      rows: [{ userId: 'owner-1', courtName: 'Court 1', facilityName: 'Test Club' }],
    });

    const count = await expireSplitCourtReservations();

    expect(count).toBe(1);
    expect(refundSplitPaymentSharesMock).toHaveBeenCalledWith('booking-1');
    expect(createNotificationMock).toHaveBeenCalledWith(
      'owner-1',
      expect.any(String),
      expect.stringContaining('refunded'),
      'split_payment_cancelled',
      expect.any(Object)
    );
  });

  it('does nothing when no bookings are past their deadline', async () => {
    txClientQueryMock.mockResolvedValueOnce({ rows: [] });

    const count = await expireSplitCourtReservations();

    expect(count).toBe(0);
    expect(refundSplitPaymentSharesMock).not.toHaveBeenCalled();
  });
});

describe('updateSplitPaymentParticipants', () => {
  const OWNER = 'owner-1';
  const BOOKING = 'booking-1';

  /**
   * Queues the reads updateSplitPaymentParticipants performs, in order:
   * booking → memberships → existing shares → (notification details).
   */
  function primeReads(existingShares: any[], participantIds: string[]) {
    const ids = [OWNER, ...participantIds];
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: BOOKING, ownerId: OWNER, status: 'pending', facilityId: 'facility-1', courtId: 'court-1',
          durationMinutes: 60, paymentMode: 'split', deadline: new Date(Date.now() + 60 * 60_000),
        }],
      })
      .mockResolvedValueOnce({ rows: ids.map((id) => ({ user_id: id })) })
      .mockResolvedValueOnce({ rows: existingShares })
      .mockResolvedValueOnce({ rows: [{ courtName: 'Court 1', facilityName: 'Test Club' }] })
      .mockResolvedValue({ rows: [] });
  }

  beforeEach(() => {
    queryMock.mockReset();
    txClientQueryMock.mockReset().mockResolvedValue({ rows: [] });
    transactionMock.mockClear();
    loadCourtPaymentSettingsMock.mockReset().mockResolvedValue({ booking_amount_cents: 1200 });
    refundSplitShareDifferenceMock.mockReset().mockResolvedValue(true);
    createNotificationMock.mockReset().mockResolvedValue('notif-id');
  });

  it('swapping one member for another moves no money', async () => {
    primeReads(
      [
        { id: 'share-owner', userId: OWNER, amountCents: 600, status: 'paid' },
        { id: 'share-bob', userId: 'bob', amountCents: 600, status: 'pending' },
      ],
      ['carol']
    );

    const result = await updateSplitPaymentParticipants({
      bookingId: BOOKING, actorUserId: OWNER, participantIds: ['carol'],
    });

    // Headcount unchanged ⇒ owner's paid $6 still matches, so no refund at all.
    expect(refundSplitShareDifferenceMock).not.toHaveBeenCalled();
    expect(result.shares).toEqual([
      { userId: OWNER, amountCents: 600, status: 'paid' },
      { userId: 'carol', amountCents: 600, status: 'pending' },
    ]);
  });

  it('adding a member partially refunds whoever already overpaid', async () => {
    primeReads(
      [
        { id: 'share-owner', userId: OWNER, amountCents: 600, status: 'paid' },
        { id: 'share-bob', userId: 'bob', amountCents: 600, status: 'pending' },
      ],
      ['bob', 'carol']
    );

    const result = await updateSplitPaymentParticipants({
      bookingId: BOOKING, actorUserId: OWNER, participantIds: ['bob', 'carol'],
    });

    // $12 over 3 people = $4 each; owner paid $6, so exactly $2 goes back.
    expect(refundSplitShareDifferenceMock).toHaveBeenCalledTimes(1);
    expect(refundSplitShareDifferenceMock).toHaveBeenCalledWith({ shareId: 'share-owner', refundAmountCents: 200 });
    expect(result.shares.find((s) => s.userId === OWNER)).toEqual({ userId: OWNER, amountCents: 400, status: 'paid' });
  });

  it('removing a member refunds them in full and resets anyone whose share went up', async () => {
    primeReads(
      [
        { id: 'share-owner', userId: OWNER, amountCents: 400, status: 'paid' },
        { id: 'share-bob', userId: 'bob', amountCents: 400, status: 'paid' },
        { id: 'share-carol', userId: 'carol', amountCents: 400, status: 'pending' },
      ],
      ['bob']
    );

    const result = await updateSplitPaymentParticipants({
      bookingId: BOOKING, actorUserId: OWNER, participantIds: ['bob'],
    });

    // Carol removed (unpaid, nothing to refund). $12 over 2 = $6 each, so the owner
    // and Bob each paid $4 but now owe $6 — both fully refunded and reset to pending.
    const refunded = refundSplitShareDifferenceMock.mock.calls.map((call) => call[0]);
    expect(refunded).toEqual([
      { shareId: 'share-owner', refundAmountCents: 400 },
      { shareId: 'share-bob', refundAmountCents: 400 },
    ]);
    expect(result.shares).toEqual([
      { userId: OWNER, amountCents: 600, status: 'pending' },
      { userId: 'bob', amountCents: 600, status: 'pending' },
    ]);
  });

  it('refuses edits from anyone but the organizer', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: BOOKING, ownerId: OWNER, status: 'pending', facilityId: 'facility-1', courtId: 'court-1',
        durationMinutes: 60, paymentMode: 'split', deadline: new Date(Date.now() + 60 * 60_000),
      }],
    });

    await expect(
      updateSplitPaymentParticipants({ bookingId: BOOKING, actorUserId: 'bob', participantIds: ['carol'] })
    ).rejects.toThrow(/only the member who booked/i);
    expect(refundSplitShareDifferenceMock).not.toHaveBeenCalled();
  });

  it('refuses edits once the payment window has closed', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: BOOKING, ownerId: OWNER, status: 'pending', facilityId: 'facility-1', courtId: 'court-1',
        durationMinutes: 60, paymentMode: 'split', deadline: new Date(Date.now() - 60_000),
      }],
    });

    await expect(
      updateSplitPaymentParticipants({ bookingId: BOOKING, actorUserId: OWNER, participantIds: ['carol'] })
    ).rejects.toThrow(/payment window .* closed/i);
  });

  it('still enforces the 4-person cap', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: BOOKING, ownerId: OWNER, status: 'pending', facilityId: 'facility-1', courtId: 'court-1',
        durationMinutes: 60, paymentMode: 'split', deadline: new Date(Date.now() + 60 * 60_000),
      }],
    });

    await expect(
      updateSplitPaymentParticipants({ bookingId: BOOKING, actorUserId: OWNER, participantIds: ['a', 'b', 'c', 'd'] })
    ).rejects.toThrow(/at most 4 people/);
  });
});
