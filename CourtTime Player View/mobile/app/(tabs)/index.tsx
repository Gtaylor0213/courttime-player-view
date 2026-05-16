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
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/utils/alert';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Gradients, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { EditBookingModal } from '../../src/components/EditBookingModal';
import { QuickBook } from '../../src/components/QuickBook';
import { EmptyState } from '../../src/components/EmptyState';
import { useOfflineApi } from '../../src/hooks/useOfflineApi';
import type { BookingWithDetails, BulletinPostWithAuthor } from '../../src/types/database';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import {
  addBookingToCalendarWithFeedback,
  bookingWithDetailsToCalendarDetails,
} from '../../src/utils/bookingCalendar';

export const ErrorBoundary = createRouteErrorBoundary('Home');

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity?: string;
}

export default function HomeScreen() {
  const { user, facilityId, facilities } = useAuth();
  const currentFacilityName = facilities.find((f) => f.id === facilityId)?.name;
  const router = useRouter();
  const { bannerState, lastCachedAt, fetchWithCache, retryConnectivity } = useOfflineApi();
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
      <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
      <View style={styles.welcomeOuter}>
        <LinearGradient
          colors={[...Gradients.homeHero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcome}
        >
          <View style={styles.welcomeBlobA} />
          <View style={styles.welcomeBlobB} />
          <Text style={styles.greetingEyebrow}>Home</Text>
          <Text style={styles.greeting}>
            Welcome back, {user?.firstName || 'Player'}
          </Text>
          <Text style={styles.greetingSub}>Here is a quick snapshot of your club.</Text>
        </LinearGradient>
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
          activeOpacity={0.88}
        >
          <View style={[styles.actionIconWrap, styles.actionIconWrapPrimary]}>
            <Text style={styles.actionEmoji}>{'\u{1F3BE}'}</Text>
          </View>
          <Text style={styles.actionLabel}>Book a Court</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/community')}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Open community"
        >
          <View style={styles.actionIconWrap}>
            <Ionicons name="people" size={24} color={Colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Community</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, !facilityId && styles.actionCardFull]}
          onPress={() => router.push('/payments')}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Open club payments"
        >
          <View style={[styles.actionIconWrap, styles.actionIconWrapPrimary]}>
            <Ionicons name="card-outline" size={24} color={Colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Payments</Text>
        </TouchableOpacity>

        {facilityId ? (
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push({ pathname: '/club-info', params: { facilityId } })}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open club information"
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="information-circle" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Club Info</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Quick Book — soonest open slots today */}
      {user && facilityId && !lockout?.isLockedOut && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconBadge}>
              <Ionicons name="flash" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Quick Book</Text>
          </View>
          <QuickBook
            userId={user.id}
            facilityId={facilityId}
            facilityName={currentFacilityName}
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
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionIconBadge}>
            <Ionicons name="calendar" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
        </View>
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
                    {Platform.OS !== 'web' ? (
                      <TouchableOpacity
                        style={styles.calendarButton}
                        onPress={() => {
                          void addBookingToCalendarWithFeedback(
                            bookingWithDetailsToCalendarDetails(booking, {
                              facilityName: currentFacilityName || booking.facilityName,
                            }),
                            { bookingConfirmed: false }
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Add to calendar"
                      >
                        <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                        <Text style={styles.calendarText}>Calendar</Text>
                      </TouchableOpacity>
                    ) : null}
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
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionIconBadge}>
            <Ionicons name="megaphone" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>Bulletin Board</Text>
        </View>
        {bulletins.length === 0 ? (
          <EmptyState
            icon="megaphone-outline"
            title="No announcements yet"
            description="You are all caught up."
          />
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
      <Modal
        visible={showViolations}
        transparent
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowViolations(false)}
      >
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
  welcomeOuter: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  welcome: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    overflow: 'hidden',
  },
  welcomeBlobA: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.14)',
    top: -70,
    right: -60,
  },
  welcomeBlobB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(143,255,212,0.25)',
    bottom: -20,
    left: -30,
  },
  greetingEyebrow: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.textInverse,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  greetingSub: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
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
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '48%',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  actionCardFull: {
    flexBasis: '100%',
    maxWidth: '100%',
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapPrimary: {
    backgroundColor: Colors.primary + '1A',
  },
  actionEmoji: {
    fontSize: 26,
  },
  actionLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: 0,
    flex: 1,
    letterSpacing: -0.2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationsOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
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
  bookingCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
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
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
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
