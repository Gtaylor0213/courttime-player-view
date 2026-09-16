/**
 * The "More" tab: Community, plus whatever flagged features this facility has enabled.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeatureFlags } from '../../src/contexts/FeatureFlagContext';
import { getMoreMenuItems } from '../../src/utils/moreMenu';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('More');

export default function MoreScreen() {
  const router = useRouter();
  const { isFeatureEnabled } = useFeatureFlags();
  const items = getMoreMenuItems(isFeatureEnabled);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.row}
          onPress={() => router.push(item.route as never)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon as never} size={22} color={Colors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowDescription}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  rowDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
