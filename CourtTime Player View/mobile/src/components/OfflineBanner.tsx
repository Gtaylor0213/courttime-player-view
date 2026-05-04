/**
 * OfflineBanner
 * Shows connectivity status when offline or backend is unreachable.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../constants/theme';

type ConnectivityBannerState = 'offline' | 'backend_unreachable' | 'online';

interface Props {
  state: ConnectivityBannerState;
  cachedAt?: number | null;
  onRetry?: () => void;
}

function formatCachedAt(cachedAt?: number | null): string {
  if (!cachedAt) return '';
  const timeLabel = new Date(cachedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return ` (as of ${timeLabel})`;
}

export function OfflineBanner({ state, cachedAt, onRetry }: Props) {
  if (state === 'online') return null;

  if (state === 'backend_unreachable') {
    return (
      <TouchableOpacity style={[styles.banner, styles.bannerBackend]} onPress={onRetry} activeOpacity={0.85}>
        <Ionicons name="warning-outline" size={16} color={Colors.textInverse} />
        <Text style={styles.text}>We're having trouble reaching CourtTime. Tap to retry.</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.banner, styles.bannerOffline]}>
      <Ionicons name="cloud-offline" size={16} color={Colors.textInverse} />
      <Text style={styles.text}>You are offline — showing cached data{formatCachedAt(cachedAt)}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
  },
  bannerOffline: {
    backgroundColor: Colors.error,
  },
  bannerBackend: {
    backgroundColor: Colors.warning,
  },
  text: {
    color: Colors.textInverse,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
