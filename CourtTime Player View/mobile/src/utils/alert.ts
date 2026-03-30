/**
 * Cross-platform alert that works on web and native
 */

import { Alert, Platform } from 'react-native';

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
