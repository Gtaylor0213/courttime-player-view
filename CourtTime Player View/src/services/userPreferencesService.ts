import { query } from '../database/connection';

export interface NotificationPreferences {
  pushEnabled: boolean;
  pushBookingUpdates: boolean;
  pushBookingReminders: boolean;
  pushStrikes: boolean;
  pushAnnouncements: boolean;
  pushWeather: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  pushBookingUpdates: true,
  pushBookingReminders: true,
  pushStrikes: true,
  pushAnnouncements: true,
  pushWeather: true,
};

/**
 * Get notification preferences for a user.
 * Returns defaults (all enabled) if the user has no preferences row yet.
 */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const result = await query(
    `SELECT
        push_enabled            as "pushEnabled",
        push_booking_updates    as "pushBookingUpdates",
        push_booking_reminders  as "pushBookingReminders",
        push_strikes            as "pushStrikes",
        push_announcements      as "pushAnnouncements",
        push_weather            as "pushWeather"
     FROM user_preferences
     WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...result.rows[0] };
}

/**
 * Update notification preferences. Creates the user_preferences row if missing.
 * Only the keys present in `updates` are written.
 */
export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const colMap: Record<keyof NotificationPreferences, string> = {
    pushEnabled: 'push_enabled',
    pushBookingUpdates: 'push_booking_updates',
    pushBookingReminders: 'push_booking_reminders',
    pushStrikes: 'push_strikes',
    pushAnnouncements: 'push_announcements',
    pushWeather: 'push_weather',
  };

  const entries = Object.entries(updates).filter(([_, v]) => typeof v === 'boolean') as Array<[keyof NotificationPreferences, boolean]>;
  if (entries.length === 0) return getNotificationPreferences(userId);

  // Ensure a row exists for this user
  await query(
    `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const setClauses: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [key, value] of entries) {
    setClauses.push(`${colMap[key]} = $${i++}`);
    values.push(value);
  }
  values.push(userId);

  await query(
    `UPDATE user_preferences SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${i}`,
    values
  );

  return getNotificationPreferences(userId);
}

/**
 * Map a notification type string to the preference column that gates it.
 * Returns null for types that should always send (none currently — defensive).
 */
export function preferenceKeyForType(type: string): keyof NotificationPreferences | null {
  switch (type) {
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'court_change':
    case 'reservation_confirmed':
    case 'reservation_cancelled':
      return 'pushBookingUpdates';
    case 'booking_reminder':
    case 'reservation_reminder':
      return 'pushBookingReminders';
    case 'strike_issued':
    case 'strike_revoked':
    case 'account_lockout':
    case 'account_locked_out':
      return 'pushStrikes';
    case 'facility_announcement':
      return 'pushAnnouncements';
    case 'weather_alert':
      return 'pushWeather';
    default:
      return null;
  }
}
