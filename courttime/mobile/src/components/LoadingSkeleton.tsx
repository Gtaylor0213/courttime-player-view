/**
 * Loading Skeleton
 * Placeholder cards shown while data is loading.
 */

import { View, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { Skeleton as SkeletonBlock } from './Skeleton';

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width="60%" height={14} />
          <SkeletonBlock width="90%" height={12} style={{ marginTop: Spacing.sm }} />
          <SkeletonBlock width="40%" height={12} style={{ marginTop: Spacing.sm }} />
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={styles.profileContainer}>
      <SkeletonBlock width={80} height={80} style={{ borderRadius: 40, alignSelf: 'center' }} />
      <SkeletonBlock width="50%" height={20} style={{ alignSelf: 'center', marginTop: Spacing.md }} />
      <SkeletonBlock width="35%" height={14} style={{ alignSelf: 'center', marginTop: Spacing.sm }} />
    </View>
  );
}

export function ConversationSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.conversationRow}>
          <SkeletonBlock width={48} height={48} style={{ borderRadius: 24 }} />
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="45%" height={14} />
            <SkeletonBlock width="75%" height={12} style={{ marginTop: Spacing.sm }} />
          </View>
          <SkeletonBlock width={40} height={10} />
        </View>
      ))}
    </View>
  );
}

export function CommunitySkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width="35%" height={11} />
          <SkeletonBlock width="70%" height={16} style={{ marginTop: Spacing.sm }} />
          <SkeletonBlock width="100%" height={11} style={{ marginTop: Spacing.sm }} />
          <SkeletonBlock width="88%" height={11} style={{ marginTop: Spacing.xs }} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
            <SkeletonBlock width={72} height={24} style={{ borderRadius: BorderRadius.full }} />
            <SkeletonBlock width={92} height={24} style={{ borderRadius: BorderRadius.full }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function BookingSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <SkeletonBlock width="55%" height={16} />
        <SkeletonBlock width="100%" height={220} style={{ marginTop: Spacing.md, borderRadius: BorderRadius.md }} />
      </View>
      <View style={styles.card}>
        <SkeletonBlock width="35%" height={14} />
        <SkeletonBlock width="100%" height={340} style={{ marginTop: Spacing.md, borderRadius: BorderRadius.md }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileContainer: {
    padding: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  conversationRow: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
