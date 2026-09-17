/**
 * Lessons and clinics.
 *
 * Mirrors web's `Lessons.tsx`. The server returns bulletin-shaped posts
 * filtered to lesson types, so this reuses the bulletin display helpers rather
 * than formatting dates and labels a second way.
 *
 * Sign-up, payment and withdrawal use the same hook as the Community tab
 * (useActivitySignup), so a member can sign up here without leaving — as on web.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { lessonsEndpoints } from '../src/api/endpoints';
import {
  formatBulletinPostProminentDate,
  getLessonPostTypeLabel,
  minParticipantsNotice,
} from '../../shared/utils/bulletinPostDisplay';
import { formatCentsAsUsd } from '../src/utils/payments';
import { useActivitySignup } from '../src/hooks/useActivitySignup';
import { lessonSignupCheckoutUrls } from '../../shared/utils/mobileCheckoutUrls';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Lessons');

interface LessonPost {
  id: string;
  title: string;
  content?: string;
  type?: string;
  category?: string;
  drillStartAt?: string | null;
  drillCourtName?: string | null;
  drillMaxParticipants?: number;
  drillConfirmedCount?: number;
  minParticipants?: number;
  cancelIfMinNotMet?: boolean;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
  currentUserSignupStatus?: 'confirmed' | 'waitlist' | null;
  currentUserWaitlistPosition?: number | null;
  currentUserCanSignup?: boolean;
  signupBlockedReason?: string | null;
}

export default function LessonsScreen() {
  const { facilityId, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ signupSuccess?: string; session_id?: string; postId?: string }>();
  const [lessons, setLessons] = useState<LessonPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const res = await lessonsEndpoints.upcoming(facilityId);
    if (res.success) {
      // This route returns { success, posts } rather than a data envelope.
      const posts = (res.data as { posts?: unknown })?.posts;
      setLessons(Array.isArray(posts) ? (posts as LessonPost[]) : []);
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { busyId, signUp, cancelSignup, confirmReturn } = useActivitySignup(load);

  // Back from Stripe after a paid sign-up (lessonSignupCheckoutUrls).
  useEffect(() => {
    if (params.signupSuccess !== '1' || !user?.id) return;
    router.setParams({ signupSuccess: undefined, session_id: undefined } as never);
    void confirmReturn(typeof params.session_id === 'string' ? params.session_id : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.signupSuccess, params.session_id, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Lessons' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (lessons.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lessons' }} />
        <EmptyState
          icon="school-outline"
          title="No lessons scheduled"
          description="When your club posts a lesson or clinic, it will show up here."
        />
      </>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Lessons' }} />

      {lessons.map((lesson) => {
        const typeLabel = getLessonPostTypeLabel(lesson);
        const when = formatBulletinPostProminentDate(lesson, 'short');
        const minNotice = minParticipantsNotice(lesson);
        const spotsKnown = typeof lesson.drillMaxParticipants === 'number';

        return (
          <View key={lesson.id} style={styles.card} accessibilityLabel={lesson.title}>
            <View style={styles.cardTop}>
              <Text style={styles.title}>{lesson.title}</Text>
              {typeLabel ? <Text style={styles.typeBadge}>{typeLabel}</Text> : null}
            </View>

            {lesson.content ? (
              <Text style={styles.body} numberOfLines={3}>
                {lesson.content}
              </Text>
            ) : null}

            {when ? (
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.metaText}>{when}</Text>
              </View>
            ) : null}

            {lesson.drillCourtName ? (
              <View style={styles.metaRow}>
                <Ionicons name="tennisball-outline" size={14} color={Colors.primary} />
                <Text style={styles.metaText}>{lesson.drillCourtName}</Text>
              </View>
            ) : null}

            {spotsKnown ? (
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <Text style={styles.metaText}>
                  {lesson.drillConfirmedCount || 0} / {lesson.drillMaxParticipants} signed up
                </Text>
              </View>
            ) : null}

            {minNotice ? (
              <View style={styles.metaRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={lesson.cancelIfMinNotMet ? Colors.warning : Colors.primary}
                />
                <Text style={styles.metaText}>{minNotice}</Text>
              </View>
            ) : null}

            <View style={styles.cardFooter}>
              {lesson.requirePayment && lesson.signupAmountCents ? (
                <Text style={styles.price}>{formatCentsAsUsd(lesson.signupAmountCents)}</Text>
              ) : (
                <Text style={styles.free}>Free</Text>
              )}
              {lesson.currentUserSignupStatus ? (
                <View style={styles.footerRight}>
                  <Text style={styles.signupHint}>
                    {lesson.currentUserSignupStatus === 'confirmed'
                      ? "You're signed up"
                      : `Waitlist #${lesson.currentUserWaitlistPosition ?? '?'}`}
                  </Text>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonCancel]}
                    onPress={() => cancelSignup(lesson.id)}
                    disabled={busyId === lesson.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel signup for ${lesson.title}`}
                  >
                    <Text style={styles.buttonCancelText}>{busyId === lesson.id ? '...' : 'Cancel Signup'}</Text>
                  </TouchableOpacity>
                </View>
              ) : lesson.currentUserCanSignup !== false && !lesson.signupBlockedReason ? (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => void signUp(lesson, lessonSignupCheckoutUrls(lesson.id))}
                  disabled={busyId === lesson.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Sign up for ${lesson.title}`}
                >
                  <Text style={styles.buttonText}>
                    {busyId === lesson.id
                      ? '...'
                      : lesson.requirePayment && lesson.signupAmountCents
                        ? `Pay & Sign Up · ${formatCentsAsUsd(lesson.signupAmountCents)}`
                        : 'Sign Up'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.blocked}>{lesson.signupBlockedReason || 'Sign-up closed'}</Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  typeBadge: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary, flexShrink: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  price: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.primary,
  },
  free: { fontSize: FontSize.sm, color: Colors.textMuted },
  signupHint: { fontSize: FontSize.xs, color: Colors.primary },
  footerRight: { alignItems: 'flex-end', gap: 4 },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  buttonText: { color: Colors.textInverse, fontFamily: FontFamily.bold, fontWeight: '700', fontSize: FontSize.sm },
  buttonCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border, paddingVertical: 6 },
  buttonCancelText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.xs },
  blocked: { fontSize: FontSize.xs, color: Colors.textMuted, flexShrink: 1, textAlign: 'right' },
});
