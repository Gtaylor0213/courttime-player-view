import { query } from '../database/connection';

/** In-app / push types that users cannot opt out of. */
export const MANDATORY_PUSH_NOTIFICATION_TYPES = new Set([
  'strike_issued',
  'strike_revoked',
  'account_lockout',
  'account_locked_out',
]);

export interface NotificationPreferences {
  emailNotificationsEnabled: boolean;
  /** Court booking confirmation and cancellation emails */
  emailBookingConfirmations: boolean;
  /** When you are a facility admin: email when someone requests to join */
  emailMembershipRequestAlerts: boolean;
  pushEnabled: boolean;
  pushBookingUpdates: boolean;
  pushBookingReminders: boolean;
  pushStrikes: boolean;
  pushAnnouncements: boolean;
  pushWeather: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  emailNotificationsEnabled: true,
  emailBookingConfirmations: true,
  emailMembershipRequestAlerts: true,
  pushEnabled: true,
  pushBookingUpdates: true,
  pushBookingReminders: true,
  pushStrikes: true,
  pushAnnouncements: true,
  pushWeather: true,
};

let emailNotificationsColumnReady = false;

async function ensureEmailNotificationsColumn(): Promise<void> {
  if (emailNotificationsColumnReady) return;

  await query(
    `ALTER TABLE user_preferences
       ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT true`
  );
  await query(
    `ALTER TABLE user_preferences
       ADD COLUMN IF NOT EXISTS email_booking_confirmations BOOLEAN NOT NULL DEFAULT true`
  );
  await query(
    `ALTER TABLE user_preferences
       ADD COLUMN IF NOT EXISTS email_membership_request_alerts BOOLEAN NOT NULL DEFAULT true`
  );
  emailNotificationsColumnReady = true;
}

/**
 * Get notification preferences for a user.
 * Returns defaults (all enabled) if the user has no preferences row yet.
 */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  await ensureEmailNotificationsColumn();

  const result = await query(
    `SELECT
        COALESCE(email_notifications_enabled, true) as "emailNotificationsEnabled",
        COALESCE(email_booking_confirmations, true) as "emailBookingConfirmations",
        COALESCE(email_membership_request_alerts, true) as "emailMembershipRequestAlerts",
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
  const prefs = { ...DEFAULT_PREFS, ...result.rows[0] };
  prefs.pushStrikes = true;
  return prefs;
}

/**
 * Update notification preferences. Creates the user_preferences row if missing.
 * Only the keys present in `updates` are written.
 */
export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  await ensureEmailNotificationsColumn();

  const colMap: Record<keyof NotificationPreferences, string> = {
    emailNotificationsEnabled: 'email_notifications_enabled',
    emailBookingConfirmations: 'email_booking_confirmations',
    emailMembershipRequestAlerts: 'email_membership_request_alerts',
    pushEnabled: 'push_enabled',
    pushBookingUpdates: 'push_booking_updates',
    pushBookingReminders: 'push_booking_reminders',
    pushStrikes: 'push_strikes',
    pushAnnouncements: 'push_announcements',
    pushWeather: 'push_weather',
  };

  const sanitizedUpdates = { ...updates };
  if (sanitizedUpdates.pushStrikes === false) {
    delete sanitizedUpdates.pushStrikes;
  }

  const entries = Object.entries(sanitizedUpdates).filter(
    ([key, value]) =>
      typeof value === 'boolean' && Object.prototype.hasOwnProperty.call(colMap, key)
  ) as Array<[keyof NotificationPreferences, boolean]>;
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
    `UPDATE user_preferences SET ${setClauses.join(', ')}, push_strikes = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${i}`,
    values
  );

  return getNotificationPreferences(userId);
}

/** Strikes, lockouts, facility blast-style messages, and other non-booking transactional email. */
export async function isEmailNotificationsEnabled(userId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs.emailNotificationsEnabled;
}

export async function isEmailBookingConfirmationsEnabled(userId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs.emailBookingConfirmations !== false;
}

export async function isEmailMembershipRequestAlertsEnabled(userId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs.emailMembershipRequestAlerts !== false;
}

/**
 * Map an in-app notification type string to the push preference column that gates it.
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
      return null;
    case 'facility_announcement':
      return 'pushAnnouncements';
    case 'weather_alert':
      return 'pushWeather';
    default:
      return null;
  }
}
