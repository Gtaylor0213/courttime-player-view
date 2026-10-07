/**
 * Cross-platform alert that works on web and native
 */

import { Alert, Platform } from 'react-native';
import type { ApiFailureShape } from './apiUserMessages';
import { userFacingApiMessage } from './apiUserMessages';

interface AlertButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

export function showAlert(title: string, message: string, buttons?: AlertButton[]) {
  if (Platform.OS === 'web') {
    if (!buttons || buttons.length <= 1) {
      window.alert(`${title}\n\n${message}`);
      buttons?.[0]?.onPress?.();
      return;
    }

    // For confirm dialogs, use window.confirm
    const confirmButton = buttons.find(b => b.style !== 'cancel');
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      confirmButton?.onPress?.();
    } else {
      const cancelButton = buttons.find(b => b.style === 'cancel');
      cancelButton?.onPress?.();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}

/** Single place for failed API responses — title reflects auth vs generic errors. */
export function showApiErrorAlert(res: ApiFailureShape, title: string = 'Error'): void {
  if (res.success) return;
  const message = userFacingApiMessage(res);
  const resolvedTitle =
    res.errorCategory === 'unauthorized'
      ? 'Session expired'
      : res.errorCategory === 'offline'
        ? 'Offline'
        : title;
  showAlert(resolvedTitle, message);
}
