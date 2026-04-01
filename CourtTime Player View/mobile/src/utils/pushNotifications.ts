/**
 * Push Notification Registration
 * Handles permission requests, token retrieval, and server registration.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '../api/client';

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

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'courttime', // matches app.json slug
    });
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
        lightColor: '#1a5f2a',
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
