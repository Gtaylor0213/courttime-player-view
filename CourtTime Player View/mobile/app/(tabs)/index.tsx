/**
 * Home Tab
 * Player dashboard showing upcoming bookings, bulletin board, and events
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { BookingWithDetails, BulletinPostWithAuthor } from '../../src/types/database';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [bulletins, setBulletins] = useState<BulletinPostWithAuthor[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [bookingsRes, bulletinsRes] = await Promise.all([
      api.get(`/api/bookings/user/${user.id}?status=confirmed&limit=3`),
      api.get(`/api/bulletin?limit=5`),
    ]);

    if (bookingsRes.success && bookingsRes.data) {
      setBookings(Array.isArray(bookingsRes.data) ? bookingsRes.data : bookingsRes.data.bookings || []);
    }
    if (bulletinsRes.success && bulletinsRes.data) {
      setBulletins(Array.isArray(bulletinsRes.data) ? bulletinsRes.data : bulletinsRes.data.posts || []);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.welcome}>
        <Text style={styles.greeting}>
          Welcome back, {user?.firstName || 'Player'}!
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/book')}
        >
          <Text style={styles.actionEmoji}>{'\u{1F3BE}'}</Text>
          <Text style={styles.actionLabel}>Book a Court</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/messages')}
        >
          <Text style={styles.actionEmoji}>{'\u{1F4AC}'}</Text>
          <Text style={styles.actionLabel}>Messages</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming Bookings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
        {bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No upcoming bookings</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/book')}>
              <Text style={styles.emptyLink}>Book a court now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          bookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Text style={styles.bookingCourt}>{booking.courtName}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{booking.status}</Text>
                </View>
              </View>
              <Text style={styles.bookingDate}>
                {formatDate(booking.bookingDate)}
              </Text>
              <Text style={styles.bookingTime}>
                {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Bulletin Board */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bulletin Board</Text>
        {bulletins.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        ) : (
          bulletins.map((post) => (
            <View key={post.id} style={styles.bulletinCard}>
              <Text style={styles.bulletinTitle}>{post.title}</Text>
              <Text style={styles.bulletinContent} numberOfLines={2}>
                {post.content}
              </Text>
              <Text style={styles.bulletinMeta}>
                {post.authorName} · {formatDate(post.postedDate)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  welcome: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  greeting: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  quickActions: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionEmoji: {
    fontSize: 28,
  },
  actionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  emptyLink: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  bookingCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  bookingCourt: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  statusBadge: {
    backgroundColor: Colors.primaryLight + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bookingDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  bookingTime: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bulletinCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bulletinTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  bulletinContent: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  bulletinMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
