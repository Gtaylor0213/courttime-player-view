/**
 * Push Notification Registration
 * Handles permission requests, token retrieval, and server registration.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '../api/client';
import { Colors } from '../constants/theme';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request permission and register push token with the server.
 * Returns the Expo push token string or null if unavailable.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    return null;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get Expo push token (projectId must be an EAS UUID, not the app slug)
  try {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const candidate =
      extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const projectId = typeof candidate === 'string' && uuidRe.test(candidate) ? candidate : undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId !== undefined ? { projectId } : {}
    );
    const pushToken = tokenData.data;

    // Register with backend
    await api.post('/api/notifications/register-device', {
      userId,
      pushToken,
      platform: Platform.OS,
    });

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CourtTime',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: Colors.androidNotificationLed,
      });
    }

    return pushToken;
  } catch (error) {
    console.error('Push notification registration error:', error);
    return null;
  }
}

/**
 * Unregister push token from server (call on logout).
 */
export async function unregisterPushNotifications(userId: string, pushToken?: string | null): Promise<void> {
  try {
    await api.post('/api/notifications/unregister-device', {
      userId,
      pushToken: pushToken || undefined,
    });
  } catch {
    // Silently fail — user is logging out anyway
  }
}
