/**
 * Blocked Members Screen
 * Lists the members this player has blocked and lets them unblock.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { moderationApi, type BlockedUser } from '../src/api/moderation';
import { showApiErrorAlert } from '../src/utils/alert';
import { unwrapApiPayload } from '../../shared/api/core';
import { Colors, Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';

export const ErrorBoundary = createRouteErrorBoundary('Blocked Members');

export default function BlockedUsersScreen() {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await moderationApi.listBlocked();
    setLoading(false);
    if (!res.success) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setBlocked(unwrapApiPayload<{ blockedUsers?: BlockedUser[] }>(res.data)?.blockedUsers ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(member: BlockedUser) {
    setUnblockingId(member.userId);
    const res = await moderationApi.unblock(member.userId);
    setUnblockingId(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not unblock');
      return;
    }
    setBlocked((prev) => prev.filter((entry) => entry.userId !== member.userId));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Blocked Members' }} />
      <Text style={styles.intro}>
        You don't see messages or posts from members you block, and you can't message each other.
      </Text>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      ) : loadFailed ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load blocked members"
          description="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : blocked.length === 0 ? (
        <EmptyState
          icon="ban-outline"
          title="No blocked members"
          description="To block someone, tap the flag on their message or post."
        />
      ) : (
        blocked.map((member) => (
          <View key={member.userId} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {member.fullName}
            </Text>
            <TouchableOpacity
              style={styles.unblockButton}
              onPress={() => void unblock(member)}
              disabled={unblockingId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${member.fullName}`}
            >
              {unblockingId === member.userId ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.unblockText}>Unblock</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  intro: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  name: { flex: 1, fontSize: FontSize.md, color: Colors.text },
  unblockButton: { minHeight: 44, minWidth: 72, alignItems: 'center', justifyContent: 'center' },
  unblockText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
});
