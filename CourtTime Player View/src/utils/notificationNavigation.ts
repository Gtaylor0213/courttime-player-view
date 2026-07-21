import type { Notification } from '../contexts/NotificationContext';

/**
 * Fallback routes when a notification row has no `actionUrl`
 * (e.g. older rows created before destinations were wired up).
 */
const FALLBACK_PATH_BY_TYPE: Record<Notification['type'], string> = {
  reservation_confirmed: '/my-reservations',
  reservation_cancelled: '/my-reservations',
  reservation_reminder: '/my-reservations',
  court_change: '/my-reservations',
  payment_received: '/payments',
  facility_announcement: '/bulletin-board',
  weather_alert: '/calendar',
};

/**
 * Resolve where an in-app notification should navigate when clicked.
 * Prefers the stored `actionUrl`; otherwise falls back by notification type.
 */
export function resolveNotificationPath(notification: Pick<Notification, 'type' | 'actionUrl'>): string | null {
  const fromUrl = notification.actionUrl?.trim();
  if (fromUrl) {
    // Only allow same-origin app paths (never external URLs from stored data).
    if (fromUrl.startsWith('/') && !fromUrl.startsWith('//')) {
      return fromUrl;
    }
    return null;
  }

  return FALLBACK_PATH_BY_TYPE[notification.type] ?? null;
}
