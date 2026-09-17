/**
 * ReservationSheet: the member-facing reservation actions web offers in
 * ReservationManagementModal — split shares, open spots, roster — render from
 * the same endpoints and gate on the same conditions.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAuth = { user: { id: 'u1', adminFacilities: [] as string[] }, facilityId: 'f1' };
jest.mock('../src/contexts/AuthContext', () => ({ useAuth: jest.fn(() => mockAuth) }));
const mockFlags = { enabled: new Set<string>() };
jest.mock('../src/contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ isFeatureEnabled: (k: string) => mockFlags.enabled.has(k) }),
}));
jest.mock('../src/utils/alert', () => ({ showAlert: jest.fn(), showApiErrorAlert: jest.fn() }));
jest.mock('../src/utils/bookingCalendar', () => ({
  addBookingToCalendarWithFeedback: jest.fn(),
  bookingWithDetailsToCalendarDetails: jest.fn(() => ({})),
}));
jest.mock('../src/utils/payments', () => ({
  formatCentsAsUsd: (c: number) => `$${(c / 100).toFixed(2)}`,
  openStripeCheckout: jest.fn(() => Promise.resolve(true)),
}));

import { api } from '../src/api/client';
import { ReservationSheet } from '../src/components/ReservationSheet';

const booking = {
  id: 'b1',
  courtId: 'c1',
  userId: 'u1',
  facilityId: 'f1',
  bookingDate: '2026-10-02',
  startTime: '18:00:00',
  endTime: '19:00:00',
  durationMinutes: 60,
  status: 'confirmed' as const,
  courtName: 'Court 1',
  facilityName: 'Demo Club',
  userName: 'Me',
  userEmail: 'me@x.com',
};

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    })
    .join(' ')
    .replace(/\s+/g, ' ');
}

async function render() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ReservationSheet booking={booking} visible onClose={() => {}} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

let getSpy: ReturnType<typeof jest.spyOn>;
let postSpy: ReturnType<typeof jest.spyOn>;

function mockDetail(extra: Record<string, unknown> = {}, split: unknown = null) {
  getSpy.mockImplementation(async (url: string) => {
    if (url === '/api/bookings/b1') return { success: true, data: { booking: { ...booking, ...extra } } };
    if (url.endsWith('/participants')) return { success: true, data: { participants: [], settlementStatus: extra.settlementStatus } };
    if (url.endsWith('/split-payment')) {
      return split ? { success: true, data: { success: true, data: split } } : { success: false, error: 'not split' };
    }
    return { success: true, data: {} };
  });
}

beforeEach(() => {
  getSpy = jest.spyOn(api, 'get');
  postSpy = jest.spyOn(api, 'post');
  mockFlags.enabled = new Set();
});
afterEach(() => {
  getSpy.mockRestore();
  postSpy.mockRestore();
});

describe('ReservationSheet', () => {
  it('shows the fetched detail and the owner actions', async () => {
    mockDetail({ notes: 'Bring balls', bookingType: 'match' });
    const text = allText(await render());
    expect(text).toContain('Court 1');
    expect(text).toContain('Notes: Bring balls');
    expect(text).toContain('Cancel Booking');
  });

  it('offers Post Spot only to the owner of a confirmed booking with a player count', async () => {
    mockDetail({ maxPlayers: 4, openToMembers: false });
    const tree = await render();
    expect(allText(tree)).toContain('Post Spot');
    postSpy.mockResolvedValue({ success: true, data: {} } as never);
    const btn = tree.root.findAll((n) => n.props.accessibilityLabel === 'Post an open spot')[0];
    await act(async () => {
      btn.props.onPress();
      await Promise.resolve();
    });
    expect(postSpy).toHaveBeenCalledWith('/api/bookings/b1/open-spot', { open: true, maxPlayers: 4 });
  });

  it('shows split shares with Pay my share for a pending share of mine', async () => {
    mockDetail({}, {
      bookingId: 'b1',
      ownerId: 'u2',
      status: 'pending',
      paymentDeadlineAt: null,
      shares: [
        { userId: 'u1', fullName: 'Me', amountCents: 1250, status: 'pending' },
        { userId: 'u2', fullName: 'Host', amountCents: 1250, status: 'paid' },
      ],
    });
    const text = allText(await render());
    expect(text).toContain('Split payment: 1 of 2 shares paid');
    expect(text).toContain('Pay my share');
    expect(text).toContain('Decline');
  });

  it('shows the players roster only for post-play bookings', async () => {
    mockDetail({ settlementStatus: 'unsettled' });
    const text = allText(await render());
    expect(text).toContain('Players on this reservation');
    expect(text).toContain('Pay after play');
  });
});
