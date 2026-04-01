/**
 * Loading Skeleton
 * Animated placeholder cards shown while data is loading.
 */

import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

function SkeletonBlock({ width = '100%', height = 16, style }: { width?: number | string; height?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: BorderRadius.sm, backgroundColor: Colors.border, opacity },
        style,
      ]}
    />
  );
}

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

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  profileContainer: {
    padding: Spacing.xl,
    backgroundColor: Colors.card,
  },
});
