/**
 * Header bell with unread badge — web's NotificationBell. Opens the
 * Notifications screen.
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationUnread } from '../contexts/NotificationUnreadContext';
import { Colors, FontFamily, TouchTarget } from '../constants/theme';

export function NotificationBell() {
  const router = useRouter();
  const { unreadCount } = useNotificationUnread();
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={Colors.chromeText} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: TouchTarget.min, height: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.chromeBackground,
  },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: FontFamily.bold, fontWeight: '700' },
});
