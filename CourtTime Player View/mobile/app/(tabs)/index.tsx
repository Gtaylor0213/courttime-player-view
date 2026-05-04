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
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/utils/alert';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { EditBookingModal } from '../../src/components/EditBookingModal';
import { QuickBook } from '../../src/components/QuickBook';
import { EmptyState } from '../../src/components/EmptyState';
import { useOfflineApi } from '../../src/hooks/useOfflineApi';
import type { BookingWithDetails, BulletinPostWithAuthor } from '../../src/types/database';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Home');

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity?: string;
}

export default function HomeScreen() {
  const { user, facilityId } = useAuth();
  const router = useRouter();
  const { isOffline, fetchWithCache } = useOfflineApi();
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [bulletins, setBulletins] = useState<BulletinPostWithAuthor[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lockout, setLockout] = useState<{ isLockedOut: boolean; activeStrikes: number; threshold: number; lockoutEndsAt?: string } | null>(null);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [quickBookKey, setQuickBookKey] = useState(0);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [warnings, setWarnings] = useState<RuleViolation[]>([]);
  const [showViolations, setShowViolations] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !facilityId) return;

    const [bookingsResult, bulletinsResult, lockoutResult] = await Promise.all([
      fetchWithCache(`bookings_${user.id}`, `/api/bookings/upcoming/${user.id}`),
      fetchWithCache(`bulletins_${facilityId}`, `/api/bulletin-board/${facilityId}`),
      fetchWithCache(`lockout_${user.id}_${facilityId}`, `/api/strikes/check/${user.id}?facilityId=${facilityId}`),
    ]);

    if (bookingsResult.data) {
      const list = Array.isArray(bookingsResult.data) ? bookingsResult.data : (bookingsResult.data as any).bookings || [];
      setBookings(list.slice(0, 3));
    }
    if (bulletinsResult.data) {
      const posts = Array.isArray(bulletinsResult.data) ? bulletinsResult.data : (bulletinsResult.data as any).posts || [];
      setBulletins(posts.slice(0, 5));
    }
    if (lockoutResult.data) {
      setLockout(lockoutResult.data as any);
    }
  }, [user, facilityId, fetchWithCache]);

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

  function handleCancelBooking(bookingId: string) {
    if (!user) return;
    Alert.alert(
      'Cancel this booking?',
      'Your court reservation will be released and made available to other members. This cannot be undone.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const res = await api.delete(`/api/bookings/${bookingId}?userId=${user.id}`);
            if (res.success) {
              fetchData();
            } else {
              Alert.alert('Error', res.error || 'Could not cancel booking');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

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
      <OfflineBanner visible={isOffline} />
      <View style={styles.welcome}>
        <Text style={styles.greeting}>
          Welcome back, {user?.firstName || 'Player'}!
        </Text>
      </View>

      {/* Lockout Banner */}
      {lockout?.isLockedOut && (
        <View style={styles.lockoutBanner}>
          <Ionicons name="lock-closed" size={20} color={Colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lockoutTitle}>Account Locked</Text>
            <Text style={styles.lockoutMessage}>
              You have {lockout.activeStrikes} strike{lockout.activeStrikes !== 1 ? 's' : ''} (threshold: {lockout.threshold}).
              {lockout.lockoutEndsAt
                ? ` Lockout ends ${new Date(lockout.lockoutEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Strike Warning (not locked out but has strikes) */}
      {lockout && !lockout.isLockedOut && lockout.activeStrikes > 0 && (
        <View style={styles.strikeWarning}>
          <Ionicons name="warning" size={18} color={Colors.warning} />
          <Text style={styles.strikeWarningText}>
            You have {lockout.activeStrikes} of {lockout.threshold} strikes. Additional violations may result in a lockout.
          </Text>
        </View>
      )}

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
          onPress={() => router.push('/(tabs)/community')}
        >
          <Ionicons name="people" size={28} color={Colors.primary} />
          <Text style={styles.actionLabel}>Community</Text>
        </TouchableOpacity>

        {facilityId && (
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push({ pathname: '/club-info', params: { facilityId } })}
          >
            <Ionicons name="information-circle" size={28} color={Colors.primary} />
            <Text style={styles.actionLabel}>Club Info</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Book — soonest open slots today */}
      {user && facilityId && !lockout?.isLockedOut && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="flash" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Quick Book</Text>
          </View>
          <QuickBook
            userId={user.id}
            facilityId={facilityId}
            refreshKey={quickBookKey}
            onBooked={() => {
              fetchData();
              setQuickBookKey(k => k + 1);
            }}
            onRuleViolations={(v, w) => {
              setViolations(v);
              setWarnings(w);
              setShowViolations(true);
            }}
          />
        </View>
      )}

      {/* Upcoming Bookings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
        {bookings.length === 0 ? (
          <EmptyState
            icon="calendar-clear-outline"
            title="No upcoming bookings"
            description="You're all clear right now. Pick a time and reserve your next court."
            actionLabel="Book a court"
            onAction={() => router.push('/(tabs)/book')}
          />
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
              <View style={styles.bookingFooter}>
                <Text style={styles.bookingTime}>
                  {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                </Text>
                {booking.status === 'confirmed' && (
                  <View style={styles.bookingActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => setEditingBooking(booking)}
                    >
                      <Ionicons name="create-outline" size={16} color={Colors.primary} />
                      <Text style={styles.editText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancelBooking(booking.id)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={Colors.error} />
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
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

      <EditBookingModal
        booking={editingBooking}
        visible={editingBooking !== null}
        onClose={() => setEditingBooking(null)}
        onSaved={fetchData}
      />

      {/* Rule violations from Quick Book */}
      <Modal visible={showViolations} transparent animationType="fade" onRequestClose={() => setShowViolations(false)}>
        <View style={styles.violationsOverlay}>
          <View style={styles.violationsSheet}>
            <View style={styles.violationsHeader}>
              <Text style={styles.violationsTitle}>Booking Not Allowed</Text>
              <TouchableOpacity onPress={() => setShowViolations(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.violationsSubtitle}>
              This booking violates the following facility rules:
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {violations.map((v, i) => (
                <View key={i} style={styles.violationCard}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.violationName}>{v.ruleName}</Text>
                    <Text style={styles.violationMsg}>{v.message}</Text>
                  </View>
                </View>
              ))}
              {warnings.length > 0 && (
                <>
                  <Text style={[styles.violationsSubtitle, { marginTop: Spacing.md }]}>Warnings:</Text>
                  {warnings.map((w, i) => (
                    <View key={`w-${i}`} style={[styles.violationCard, { borderLeftColor: Colors.warning, backgroundColor: Colors.warning + '08' }]}>
                      <Ionicons name="warning" size={18} color={Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.violationName}>{w.ruleName}</Text>
                        <Text style={styles.violationMsg}>{w.message}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.violationsDismiss}
              onPress={() => setShowViolations(false)}
            >
              <Text style={styles.violationsDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  lockoutBanner: {
    flexDirection: 'row',
    margin: Spacing.md,
    marginBottom: 0,
    padding: Spacing.md,
    backgroundColor: Colors.error + '12',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  lockoutTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.error,
  },
  lockoutMessage: {
    fontSize: FontSize.xs,
    color: Colors.text,
    marginTop: 2,
    lineHeight: 18,
  },
  strikeWarning: {
    flexDirection: 'row',
    margin: Spacing.md,
    marginBottom: 0,
    padding: Spacing.md,
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  strikeWarningText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.text,
    lineHeight: 18,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  violationsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  violationsSheet: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  violationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  violationsTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.error,
  },
  violationsSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  violationCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.error + '08',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
    marginBottom: Spacing.sm,
  },
  violationName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  violationMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  violationsDismiss: {
    backgroundColor: Colors.textSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  violationsDismissText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
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
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  bookingTime: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  bookingActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cancelText: {
    fontSize: FontSize.xs,
    color: Colors.error,
    fontWeight: '600',
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
