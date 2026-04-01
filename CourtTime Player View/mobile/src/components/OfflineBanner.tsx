/**
 * OfflineBanner
 * Shows a persistent banner when the device is offline.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline" size={16} color={Colors.textInverse} />
      <Text style={styles.text}>You are offline — showing cached data</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.textSecondary,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
  },
  text: {
    color: Colors.textInverse,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
