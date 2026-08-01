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
}));
vi.mock('../notificationService', () => ({
  notificationService: { createNotification: (...args: unknown[]) => createNotificationMock(...args) },
}));

import { createSplitCourtReservation, declineSplitPayment, expireSplitCourtReservations } from '../splitCourtPaymentService';

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
