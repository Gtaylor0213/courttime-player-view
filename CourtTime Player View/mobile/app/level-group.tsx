/**
 * My Player Group.
 *
 * Mirrors web's `MyLevelGroup.tsx`. Facilities can sort members into skill
 * tiers; a tier is only shown to players when the admin has flagged it visible,
 * so the server returns an empty result otherwise and this screen says so
 * rather than implying the member has no group.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { levelGroupEndpoints } from '../src/api/endpoints';
import { unwrapApiPayload } from '../../shared/api/core';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('My Player Group');

interface LevelGroup {
  id: string;
  name: string;
  rank: number;
  totalGroups: number;
}

interface GroupMember {
  userId: string;
  fullName: string;
  skillLevel: string | null;
}

function initialsOf(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function LevelGroupScreen() {
  const { facilityId } = useAuth();
  const [group, setGroup] = useState<LevelGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const res = await levelGroupEndpoints.mine(facilityId);
    if (res.success) {
      const data = unwrapApiPayload<{ group?: LevelGroup | null; members?: GroupMember[] }>(res.data);
      setGroup(data?.group ?? null);
      setMembers(Array.isArray(data?.members) ? data.members : []);
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
        <Stack.Screen options={{ title: 'My Player Group' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <>
        <Stack.Screen options={{ title: 'My Player Group' }} />
        <EmptyState
          icon="people-circle-outline"
          title="No group yet"
          description="Your club has not placed you in a player group, or your group is not shown to players. Ask the front desk if you think that's wrong."
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
      <Stack.Screen options={{ title: 'My Player Group' }} />

      <View style={styles.headerCard}>
        <Text style={styles.groupName}>{group.name}</Text>
        {group.totalGroups > 0 ? (
          <Text style={styles.groupRank}>
            Group {group.rank} of {group.totalGroups}
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        {members.length === 0
          ? 'No one else in your group yet'
          : `${members.length} other ${members.length === 1 ? 'player' : 'players'}`}
      </Text>

      {members.map((member) => (
        <View key={member.userId} style={styles.memberRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(member.fullName)}</Text>
          </View>
          <View style={styles.memberText}>
            <Text style={styles.memberName}>{member.fullName}</Text>
            {member.skillLevel ? (
              <Text style={styles.memberSkill}>{member.skillLevel}</Text>
            ) : null}
          </View>
        </View>
      ))}

      {members.length > 0 ? (
        <Text style={styles.footerHint}>
          Players at a similar level. Message them from the Messages tab to arrange a hit.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  headerCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: 4,
  },
  groupName: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '800',
    color: Colors.text,
  },
  groupRank: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textInverse,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  memberText: { flex: 1 },
  memberName: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  memberSkill: { fontSize: FontSize.xs, color: Colors.textSecondary },
  footerHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
