import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import BookCourtScreen from '../app/(tabs)/book';
import { api } from '../src/api/client';

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  createEventAsync: jest.fn(),
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: {
    OWNER: 'owner',
    EDITOR: 'editor',
    CONTRIBUTOR: 'contributor',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        storage.delete(key);
        return Promise.resolve();
      }),
      __reset: () => storage.clear(),
    },
  };
});

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: {
      id: 'user-1',
      adminFacilities: ['facility-1'],
    },
    facilityId: 'facility-1',
    facilities: [{ id: 'facility-1', name: 'Test Club' }],
    setFacilityId: jest.fn(),
    selectedBookDate: '2026-05-04',
    setSelectedBookDate: jest.fn(),
  })),
}));

jest.mock('../src/components/CourtCalendarGrid', () => {
  const React = require('react');
  const { TouchableOpacity, Text, View } = require('react-native');
  return {
    CourtCalendarGrid: ({
      onBookingSelected,
    }: {
      onBookingSelected: (c: unknown, s: string, e: string) => void;
    }) => (
      <View testID="mock-grid">
        <TouchableOpacity
          testID="open-booking-modal"
          onPress={() =>
            onBookingSelected(
              { id: 'court-1', name: 'Court 1', status: 'available', isWalkUp: false },
              '10:00:00',
              '11:00:00'
            )
          }
        >
          <Text>Open booking</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

jest.mock('../src/utils/alert', () => ({ showAlert: jest.fn(), showApiErrorAlert: jest.fn() }));
jest.mock('../src/utils/haptics', () => ({ hapticSuccess: jest.fn(), hapticError: jest.fn() }));
jest.mock('../src/hooks/useOfflineApi', () => ({
  useOfflineApi: jest.fn(() => ({
    bannerState: 'online',
    lastCachedAt: null,
    fetchWithCache: jest.fn(),
    retryConnectivity: jest.fn(),
  })),
}));

function collectText(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (React.isValidElement(n) && (n.props as { children?: unknown }).children != null) {
      walk((n.props as { children?: unknown }).children);
    }
  };
  walk(node);
  return out;
}

async function pressByTestId(root: renderer.ReactTestRenderer, testId: string) {
  const el = root.root.findByProps({ testID: testId });
  await act(async () => {
    const ret = el.props.onPress?.();
    if (ret != null && typeof (ret as Promise<unknown>).then === 'function') {
      await ret;
    }
  });
}

type TouchableLike = { props: { children?: unknown; onPress?: () => void } };
type ModalLike = { props: { visible?: boolean; children?: unknown } };

function pressTouchableContainingText(root: renderer.ReactTestRenderer, label: string) {
  try {
    const byA11y = root.root.findByProps({ accessibilityLabel: label });
    act(() => {
      (byA11y.props as { onPress?: () => void }).onPress?.();
    });
    return;
  } catch {
    /* fall through */
  }
  const buttons = [
    ...(root.root.findAllByType(TouchableOpacity) as TouchableLike[]),
    ...(root.root.findAllByType(Pressable) as TouchableLike[]),
  ];
  const match = buttons.find((b) => collectText(b.props.children).includes(label));
  if (!match) throw new Error(`No pressable containing "${label}"`);
  act(() => {
    match.props.onPress?.();
  });
}

function visibleModalTexts(root: renderer.ReactTestRenderer): string[] {
  const modals = root.root.findAllByType(Modal) as ModalLike[];
  const visible = modals.filter((m) => Boolean(m.props.visible));
  return visible.flatMap((m) => collectText(m.props.children));
}

describe('BookCourtScreen booking modal confirm copy', () => {
  let getSpy: jest.SpiedFunction<typeof api.get>;

  beforeEach(() => {
    jest.clearAllMocks();
    getSpy = jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/api/facilities/') && url.includes('/courts')) {
        return {
          success: true,
          data: {
            courts: [
              { id: 'court-1', name: 'Court 1', status: 'available', isWalkUp: false },
              { id: 'court-2', name: 'Court 2', status: 'available', isWalkUp: false },
            ],
          },
        };
      }
      if (url.includes('/api/bookings/facility/')) {
        return { success: true, data: { bookings: [] } };
      }
      if (url.includes('/api/court-config/facility/')) {
        return { success: true, data: { courtConfigs: [] } };
      }
      if (url.includes('/availability')) {
        return {
          success: true,
          data: {
            date: '2026-05-04',
            isOpen: true,
            operatingHours: { open: '08:00', close: '21:00' },
            slotDuration: 30,
            existingBookings: [] as Array<{ startTime: string; endTime: string }>,
          },
        };
      }
      return { success: false, error: 'unexpected url in test mock: ' + url };
    });
  });

  afterEach(() => {
    getSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shows Confirm Booking with no extra courts; Book 2 Courts with one additional; resets after close and reopen', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T07:00:00'));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });

    let texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Confirm Booking' })).not.toThrow();
    expect(texts).not.toContain('Book 2 Courts');

    await act(async () => {
      const expand = tree!.root.findByProps({ accessibilityLabel: 'Expand additional courts' });
      expand.props.onPress?.();
      await Promise.resolve();
    });

    await act(async () => {
      pressTouchableContainingText(tree!, 'Court 2');
      await Promise.resolve();
    });

    texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Book 2 Courts' })).not.toThrow();

    await act(async () => {
      await pressByTestId(tree!, 'dismiss-booking-modal');
    });

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });

    texts = visibleModalTexts(tree!);
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Confirm Booking' })).not.toThrow();
    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Book 2 Courts' })).toThrow();

    jest.useRealTimers();
  });

  it('Quick Reserve keeps selected court when jumping selectedDate to today (no silent skip on confirm)', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T14:30:00'));

    const { useAuth } = require('../src/contexts/AuthContext');
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user-1', adminFacilities: [] },
      facilityId: 'facility-1',
      facilities: [{ id: 'facility-1', name: 'Test Club' }],
      setFacilityId: jest.fn(),
      selectedBookDate: '2026-01-15',
      setSelectedBookDate: jest.fn(),
    }));

    let postSpy: jest.SpiedFunction<typeof api.post>;
    postSpy = jest.spyOn(api, 'post').mockResolvedValue({ success: true, data: {} });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      pressTouchableContainingText(tree!, 'Quick Reserve');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      pressTouchableContainingText(tree!, 'Confirm Booking');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(postSpy).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({
        courtId: 'court-1',
        facilityId: 'facility-1',
        userId: 'user-1',
        bookingDate: '2026-05-04',
      })
    );

    postSpy.mockRestore();
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: { id: 'user-1', adminFacilities: ['facility-1'] },
      facilityId: 'facility-1',
      selectedBookDate: '2026-05-04',
      setSelectedBookDate: jest.fn(),
    }));
  });

  it('offers Add to Calendar after a successful single-court booking', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-05-04T07:00:00'));

    const { showAlert } = require('../src/utils/alert');
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({ success: true, data: {} });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<BookCourtScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await pressByTestId(tree!, 'open-booking-modal');
    });

    await act(async () => {
      pressTouchableContainingText(tree!, 'Confirm Booking');
      await Promise.resolve();
      await Promise.resolve();
    });

    const bookedCall = (showAlert as jest.Mock).mock.calls.find((call: unknown[]) => call[0] === 'Booked!');

    expect(postSpy).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({
        courtId: 'court-1',
        facilityId: 'facility-1',
        userId: 'user-1',
      })
    );
    expect(bookedCall).toBeTruthy();
    expect(bookedCall?.[1]).toContain('Add it to your device calendar?');
    expect(bookedCall?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Not now' }),
        expect.objectContaining({ text: 'Add to Calendar' }),
      ])
    );

    postSpy.mockRestore();
    jest.useRealTimers();
  });
});
