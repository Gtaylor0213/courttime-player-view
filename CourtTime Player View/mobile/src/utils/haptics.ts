/**
 * Haptic Feedback
 * Light wrappers around expo-haptics for common actions.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function hapticLight() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

export function hapticMedium() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

export function hapticSuccess() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function hapticError() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}
