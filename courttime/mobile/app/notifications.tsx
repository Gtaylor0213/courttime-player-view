/**
 * Notifications — the in-app notification list web shows in the header bell
 * dropdown. Tap marks read and navigates where the notification points;
 * "Mark all read" clears the badge.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api/client';
import { unwrapApiPayload } from '../../shared/api/core';
import { useAuth } from '../src/contexts/AuthContext';
import { useNotificationUnread } from '../src/contexts/NotificationUnreadContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { getNotificationHref } from '../src/utils/notificationNavigation';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, TouchTarget } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Notifications');

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type?: string;
  read?: boolean;
  isRead?: boolean;
  actionUrl?: string | null;
  createdAt?: string;
  timestamp?: string;
  relatedReservation?: { courtName?: string; date?: string } | null;
}

function isRead(n: NotificationRow): boolean {
  return n.read === true || n.isRead === true;
}

function iconFor(type?: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'booking_confirmed':
    case 'reservation_confirmed':
      return 'checkmark-circle';
    case 'booking_cancelled':
    case 'reservation_cancelled':
      return 'close-circle';
    case 'booking_reminder':
    case 'reservation_reminder':
      return 'alarm';
    case 'court_change':
      return 'swap-horizontal';
    case 'payment':
    case 'payment_received':
    case 'split_payment_requested':
      return 'card';
    case 'message':
      return 'chatbubble-ellipses';
    case 'announcement':
    case 'facility_announcement':
      return 'megaphone';
    case 'weather':
    case 'weather_alert':
      return 'thunderstorm';
    case 'strike_issued':
    case 'account_lockout':
      return 'warning';
    default:
      return 'information-circle';
  }
}

function colorFor(type?: string, read?: boolean): string {
  if (read) return Colors.textMuted;
  switch (type) {
    case 'booking_confirmed':
    case 'reservation_confirmed':
    case 'booking_reminder':
    case 'reservation_reminder':
      return Colors.success;
    case 'booking_cancelled':
    case 'reservation_cancelled':
    case 'strike_issued':
    case 'account_lockout':
      return Colors.error;
    case 'weather':
    case 'weather_alert':
      return Colors.warning;
    default:
      return Colors.primary;
  }
}

export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshUnread, setUnreadCount } = useNotificationUnread();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const res = await api.get(`/api/notifications/${user.id}`);
    if (res.success) {
      const payload = unwrapApiPayload<{ notifications?: NotificationRow[] }>(res.data);
      setItems(Array.isArray(payload?.notifications) ? payload.notifications : []);
    }
    setLoading(false);
    void refreshUnread();
  }, [user?.id, refreshUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const unread = items.filter((n) => !isRead(n)).length;

  const markAllRead = async () => {
    if (!user?.id) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
    setUnreadCount(0);
    await api.patch(`/api/notifications/${user.id}/read-all`, {});
    void refreshUnread();
  };

  const open = async (n: NotificationRow) => {
    if (!isRead(n)) {
      setItems((prev) => prev.map((row) => (row.id === n.id ? { ...row, read: true, isRead: true } : row)));
      setUnreadCount(Math.max(0, unread - 1));
      void api.patch(`/api/notifications/${n.id}/read`, {}).then(() => refreshUnread());
    }
    router.push(getNotificationHref({ type: n.type }));
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            unread > 0 ? (
              <TouchableOpacity onPress={() => void markAllRead()} accessibilityRole="button" accessibilityLabel="Mark all read">
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="notifications-off-outline"
              title="You're all caught up"
              description="No new alerts — we'll notify you when something changes."
            />
          )
        }
        renderItem={({ item }) => {
          const read = isRead(item);
          return (
            <TouchableOpacity
              style={[styles.row, !read && styles.rowUnread]}
              onPress={() => void open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${read ? '' : 'Unread. '}${item.title}. ${item.message}`}
            >
              <Ionicons name={iconFor(item.type)} size={22} color={colorFor(item.type, read)} style={styles.icon} />
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, !read && styles.titleUnread]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.time}>{formatRelativeTime(item.timestamp || item.createdAt)}</Text>
                </View>
                <Text style={styles.message} numberOfLines={2}>
                  {item.message}
                </Text>
                {item.relatedReservation?.courtName ? (
                  <Text style={styles.related}>
                    {item.relatedReservation.courtName}
                    {item.relatedReservation.date ? ` · ${item.relatedReservation.date}` : ''}
                  </Text>
                ) : null}
              </View>
              {!read ? <View style={styles.dot} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, gap: Spacing.sm },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  markAll: { color: Colors.primary, fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: TouchTarget.min,
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  icon: { marginTop: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  titleUnread: { color: Colors.text },
  time: { fontSize: FontSize.xs, color: Colors.textMuted },
  message: { fontSize: FontSize.sm, color: Colors.textSecondary },
  related: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
});
