/**
 * Lessons and clinics.
 *
 * Mirrors web's `Lessons.tsx`. The server returns bulletin-shaped posts
 * filtered to lesson types, so this reuses the bulletin display helpers rather
 * than formatting dates and labels a second way.
 *
 * Sign-ups are handled on the Community tab, which already owns the bulletin
 * sign-up and payment flow; this screen links there rather than duplicating it.
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
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { lessonsEndpoints } from '../src/api/endpoints';
import {
  formatBulletinPostProminentDate,
  getLessonPostTypeLabel,
  minParticipantsNotice,
} from '../../shared/utils/bulletinPostDisplay';
import { formatCentsAsUsd } from '../src/utils/payments';
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
}

export default function LessonsScreen() {
  const { facilityId } = useAuth();
  const router = useRouter();
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
          <TouchableOpacity
            key={lesson.id}
            style={styles.card}
            onPress={() => router.push('/(tabs)/community' as never)}
            accessibilityRole="button"
            accessibilityLabel={`${lesson.title}. Open Community to sign up.`}
          >
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
              <Text style={styles.signupHint}>
                {lesson.currentUserSignupStatus === 'confirmed'
                  ? "You're signed up"
                  : lesson.currentUserSignupStatus === 'waitlist'
                    ? "You're on the waitlist"
                    : 'Sign up in Community ›'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
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
});
