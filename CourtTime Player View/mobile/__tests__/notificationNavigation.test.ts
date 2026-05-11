import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NotificationResponse } from 'expo-notifications';

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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNotificationHref,
  getNotificationResponseKey,
  isStartupNotificationResponseFresh,
  markNotificationResponseHandled,
  wasNotificationResponseHandledRecently,
} from '../src/utils/notificationNavigation';

function makeResponse(
  requestIdentifier = 'notification-1',
  data: Record<string, unknown> = {},
  actionIdentifier = 'expo.notifications.actions.DEFAULT'
): NotificationResponse {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: requestIdentifier,
        content: {
          data,
        },
      },
    },
  } as unknown as NotificationResponse;
}

describe('notification navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as { __reset?: () => void }).__reset?.();
  });

  it('routes booking notifications to the Book tab with booking params', () => {
    expect(
      getNotificationHref({
        type: 'booking_confirmed',
        facilityId: 'facility-123',
        bookingDate: '2026-05-11',
        bookingId: 'booking-456',
      })
    ).toEqual({
      pathname: '/(tabs)/book',
      params: {
        facilityId: 'facility-123',
        bookingDate: '2026-05-11',
        bookingId: 'booking-456',
      },
    });
  });

  it('routes message notifications to the correct thread when payload context is present', () => {
    expect(
      getNotificationHref({
        type: 'message',
        facilityId: 'facility-123',
        conversationId: 'conversation-789',
      })
    ).toEqual({
      pathname: '/(tabs)/messages',
      params: {
        facilityId: 'facility-123',
        conversationId: 'conversation-789',
      },
    });
  });

  it('still routes bare message notifications to Messages', () => {
    expect(getNotificationHref({ type: 'message' })).toBe('/(tabs)/messages');
  });

  it('falls back to Community for unknown notification payloads', () => {
    expect(getNotificationHref(undefined)).toBe('/(tabs)/community');
    expect(getNotificationHref({ type: 'unexpected' })).toBe('/(tabs)/community');
  });

  it('builds a stable response key from the notification request and action', () => {
    expect(getNotificationResponseKey(makeResponse('notif-7', {}, 'open-booking'))).toBe(
      'open-booking:notif-7'
    );
  });

  it('prefers the server notification id as the response key when present', () => {
    expect(
      getNotificationResponseKey(
        makeResponse('notif-7', { notificationId: 'notification-db-123' }, 'open-booking')
      )
    ).toBe('notification-db-123');
  });

  it('marks handled notification responses so immediate stale startup responses can be skipped', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const handledResponse = makeResponse('notif-8');
    const differentResponse = makeResponse('notif-9');

    expect(await wasNotificationResponseHandledRecently(handledResponse)).toBe(false);

    await markNotificationResponseHandled(handledResponse);

    expect(await wasNotificationResponseHandledRecently(handledResponse)).toBe(true);
    expect(await wasNotificationResponseHandledRecently(differentResponse)).toBe(false);

    nowSpy.mockRestore();
  });

  it('expires the handled-response guard after the short retry window', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const handledResponse = makeResponse('notif-10');

    await markNotificationResponseHandled(handledResponse);

    nowSpy.mockReturnValue(1_000_000 + 2 * 60 * 1000 + 1);
    expect(await wasNotificationResponseHandledRecently(handledResponse)).toBe(false);

    nowSpy.mockRestore();
  });

  it('treats very old startup responses as stale when they include server-created timestamps', () => {
    const freshResponse = makeResponse('notif-fresh', {
      notificationId: 'fresh-1',
      notificationCreatedAt: '2026-05-11T10:00:00.000Z',
    });
    const staleResponse = makeResponse('notif-stale', {
      notificationId: 'stale-1',
      notificationCreatedAt: '2026-05-08T09:59:59.000Z',
    });

    const now = Date.parse('2026-05-10T10:00:00.000Z') + 48 * 60 * 60 * 1000;

    expect(isStartupNotificationResponseFresh(freshResponse, now)).toBe(true);
    expect(isStartupNotificationResponseFresh(staleResponse, now)).toBe(false);
  });
});
