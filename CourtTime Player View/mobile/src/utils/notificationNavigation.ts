import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';

const LAST_HANDLED_NOTIFICATION_RESPONSE_KEY = 'courttime:lastHandledNotificationResponse';
const RECENTLY_HANDLED_RESPONSE_WINDOW_MS = 2 * 60 * 1000;
const MAX_STARTUP_NOTIFICATION_AGE_MS = 48 * 60 * 60 * 1000;

const BOOKING_PUSH_TYPES = new Set([
  'booking_confirmed',
  'booking_cancelled',
  'booking_reminder',
  'court_change',
  'reservation_confirmed',
  'reservation_cancelled',
  'reservation_reminder',
]);

type NotificationData = Record<string, unknown> | undefined;
type StoredHandledNotificationResponse = {
  key: string;
  handledAt: number;
};

export type NotificationRouter = {
  push: (href: Href) => void;
};

function asNonEmptyString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const next = String(value).trim();
  return next.length > 0 ? next : undefined;
}

export function getNotificationHref(raw: NotificationData): Href {
  if (!raw || typeof raw !== 'object') {
    return '/(tabs)/community';
  }

  const type = asNonEmptyString(raw.type) ?? '';
  const facilityId = asNonEmptyString(raw.facilityId);
  const bookingDate = asNonEmptyString(raw.bookingDate);
  const bookingId = asNonEmptyString(raw.bookingId);

  if (BOOKING_PUSH_TYPES.has(type)) {
    return {
      pathname: '/(tabs)/book',
      params: {
        ...(facilityId ? { facilityId } : {}),
        ...(bookingDate ? { bookingDate } : {}),
        ...(bookingId ? { bookingId } : {}),
      },
    };
  }

  if (type === 'message') {
    return '/(tabs)/messages';
  }

  return '/(tabs)/community';
}

export function navigateFromNotificationData(router: NotificationRouter, raw: NotificationData) {
  router.push(getNotificationHref(raw));
}

export function getNotificationData(response: NotificationResponse | null | undefined): NotificationData {
  const data = response?.notification?.request?.content?.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getNotificationTimestamp(response: NotificationResponse | null | undefined): number | null {
  const data = getNotificationData(response);
  const fromPayload = parseTimestamp(data?.notificationCreatedAt);
  if (fromPayload != null) return fromPayload;
  return parseTimestamp(response?.notification?.date);
}

async function readStoredHandledNotificationResponse(): Promise<StoredHandledNotificationResponse | null> {
  const raw = await AsyncStorage.getItem(LAST_HANDLED_NOTIFICATION_RESPONSE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredHandledNotificationResponse>;
    if (typeof parsed.key !== 'string' || typeof parsed.handledAt !== 'number') {
      await AsyncStorage.removeItem(LAST_HANDLED_NOTIFICATION_RESPONSE_KEY);
      return null;
    }
    return parsed as StoredHandledNotificationResponse;
  } catch {
    await AsyncStorage.removeItem(LAST_HANDLED_NOTIFICATION_RESPONSE_KEY);
    return null;
  }
}

export function getNotificationResponseKey(response: NotificationResponse | null | undefined): string | null {
  const data = getNotificationData(response);
  const notificationId = asNonEmptyString(data?.notificationId);
  if (notificationId) {
    return notificationId;
  }

  const requestIdentifier = response?.notification?.request?.identifier;
  if (typeof requestIdentifier !== 'string' || requestIdentifier.length === 0) {
    return null;
  }

  const actionIdentifier =
    typeof response?.actionIdentifier === 'string' && response.actionIdentifier.length > 0
      ? response.actionIdentifier
      : 'default';

  return `${actionIdentifier}:${requestIdentifier}`;
}

export async function wasNotificationResponseHandledRecently(
  response: NotificationResponse | null | undefined
): Promise<boolean> {
  const key = getNotificationResponseKey(response);
  if (!key) return false;

  const stored = await readStoredHandledNotificationResponse();
  if (!stored) return false;

  const stillFresh = Date.now() - stored.handledAt < RECENTLY_HANDLED_RESPONSE_WINDOW_MS;
  if (!stillFresh) {
    await AsyncStorage.removeItem(LAST_HANDLED_NOTIFICATION_RESPONSE_KEY);
    return false;
  }

  return stored.key === key;
}

export function isStartupNotificationResponseFresh(
  response: NotificationResponse | null | undefined,
  now = Date.now()
): boolean {
  const timestamp = getNotificationTimestamp(response);
  if (timestamp == null) return true;
  return now - timestamp <= MAX_STARTUP_NOTIFICATION_AGE_MS;
}

export async function markNotificationResponseHandled(
  response: NotificationResponse | null | undefined
): Promise<void> {
  const key = getNotificationResponseKey(response);
  if (!key) return;
  await AsyncStorage.setItem(
    LAST_HANDLED_NOTIFICATION_RESPONSE_KEY,
    JSON.stringify({ key, handledAt: Date.now() } satisfies StoredHandledNotificationResponse)
  );
}
