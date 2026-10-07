/**
 * Player Groups.
 *
 * Mirrors web's Messages-page "Levels" panel:
 *   - facility admins get the board (`admin/PlayerLevelGroups.tsx`): create,
 *     rename, reorder, show/hide and delete tiers, move players between tiers
 *     (per-player menu or multi-select, since there is no drag-and-drop on
 *     touch), and start a group chat with a tier;
 *   - everyone else gets "My Group" (`MyLevelGroup.tsx`): their tier, who else
 *     is in it, and a message button per player.
 *
 * A tier is only shown to players when the admin has flagged it visible, so the
 * server returns an empty result otherwise and the player view says so rather
 * than implying the member has no group.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { levelGroupEndpoints } from '../src/api/endpoints';
import { unwrapApiPayload } from '../../shared/api/core';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { Input } from '../src/components/Input';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { showAlert } from '../src/utils/alert';
import { hapticError, hapticSuccess } from '../src/utils/haptics';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily, TouchTarget } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Player Groups');

/** Group chats are capped at 30 including the creator (see groupConversationService). */
const GROUP_CHAT_LIMIT = 30;
/** Sentinel for the unassigned pool, which has no group id. */
const UNASSIGNED = '__unassigned__';

// ── Player view types (GET /me) ──
interface MyGroup {
  id: string;
  name: string;
  rank: number;
  totalGroups: number;
}
interface MyGroupMember {
  userId: string;
  fullName: string;
  skillLevel: string | null;
}

// ── Admin board types (GET /:facilityId) ──
interface LevelGroupMember {
  userId: string;
  fullName: string;
  skillLevel: string | null;
  isFacilityAdmin: boolean;
}
interface LevelGroup {
  id: string;
  name: string;
  sortPosition: number;
  isVisibleToPlayers: boolean;
  members: LevelGroupMember[];
}
interface LevelGroupBoard {
  groups: LevelGroup[];
  unassigned: LevelGroupMember[];
}
const EMPTY_BOARD: LevelGroupBoard = { groups: [], unassigned: [] };

function initialsOf(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function LevelGroupScreen() {
  const { user, facilityId } = useAuth();
  const isAdmin = !!facilityId && (user?.adminFacilities?.includes(facilityId) ?? false);

  if (!facilityId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Player Groups' }} />
        <EmptyState
          icon="people-circle-outline"
          title="No club selected"
          description="Pick a club from the header to see player groups."
        />
      </>
    );
  }

  return isAdmin ? <AdminBoard facilityId={facilityId} /> : <MyGroupView facilityId={facilityId} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Player view — mirrors web MyLevelGroup.tsx
// ═══════════════════════════════════════════════════════════════════════════

function MyGroupView({ facilityId }: { facilityId: string }) {
  const router = useRouter();
  const [group, setGroup] = useState<MyGroup | null>(null);
  const [members, setMembers] = useState<MyGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await levelGroupEndpoints.mine(facilityId);
    if (res.success) {
      const data = unwrapApiPayload<{ group?: MyGroup | null; members?: MyGroupMember[] }>(res.data);
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

  const messageMember = (member: MyGroupMember) => {
    router.push({ pathname: '/(tabs)/messages', params: { recipientId: member.userId } });
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'My Group' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <>
        <Stack.Screen options={{ title: 'My Group' }} />
        <EmptyState
          icon="people-circle-outline"
          title="You're not in a group yet"
          description="Your facility's staff sort players into groups. Once you're placed in one, you'll see your group and its other players here."
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
      <Stack.Screen options={{ title: 'My Group' }} />

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="layers-outline" size={20} color={Colors.primary} />
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          {group.totalGroups > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Group {group.rank} of {group.totalGroups}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSubtitle}>
          {members.length === 0
            ? 'You are the only player in this group right now.'
            : `${members.length} other player${members.length === 1 ? '' : 's'} in your group — message anyone to set up a hit.`}
        </Text>

        {members.length === 0 ? (
          <View style={styles.emptyInline}>
            <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
            <Text style={styles.emptyInlineText}>Check back as more players are placed.</Text>
          </View>
        ) : (
          members.map((member) => (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(member.fullName)}</Text>
              </View>
              <View style={styles.memberText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.fullName}
                </Text>
                {member.skillLevel ? <Text style={styles.memberSkill}>{member.skillLevel}</Text> : null}
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => messageMember(member)}
                accessibilityRole="button"
                accessibilityLabel={`Message ${member.fullName}`}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin board — mirrors web admin/PlayerLevelGroups.tsx
// ═══════════════════════════════════════════════════════════════════════════

type MoveTarget = { id: string; label: string };

/** What the move sheet is acting on: one player (from a zone) or the whole selection. */
type MoveSheetState =
  | { kind: 'player'; member: LevelGroupMember; zoneId: string }
  | { kind: 'selection' }
  | null;

function AdminBoard({ facilityId }: { facilityId: string }) {
  const router = useRouter();
  const [board, setBoard] = useState<LevelGroupBoard>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [rosterFilter, setRosterFilter] = useState('');

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveSheet, setMoveSheet] = useState<MoveSheetState>(null);

  const loadBoard = useCallback(async () => {
    setLoadError(null);
    const res = await levelGroupEndpoints.board(facilityId);
    if (res.success) {
      const data = unwrapApiPayload<LevelGroupBoard>(res.data);
      setBoard({
        groups: Array.isArray(data?.groups) ? data.groups : [],
        unassigned: Array.isArray(data?.unassigned) ? data.unassigned : [],
      });
    } else {
      setLoadError(res.error || 'Failed to load level groups');
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBoard();
    setRefreshing(false);
  }, [loadBoard]);

  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelected = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  /** Where a player currently sits: a group id, or UNASSIGNED. */
  const locationOf = useCallback(
    (userId: string): string => {
      for (const group of board.groups) {
        if (group.members.some((m) => m.userId === userId)) return group.id;
      }
      return UNASSIGNED;
    },
    [board]
  );

  /**
   * Move players to a tier (or the unassigned pool). Applies locally first,
   * then persists; on failure the board is reloaded from the server.
   */
  const moveMembers = async (userIds: string[], targetId: string): Promise<void> => {
    if (userIds.length === 0) return;
    const movingIds = new Set(userIds);
    const moving: LevelGroupMember[] = [];
    for (const group of board.groups) {
      for (const member of group.members) if (movingIds.has(member.userId)) moving.push(member);
    }
    for (const member of board.unassigned) if (movingIds.has(member.userId)) moving.push(member);
    if (moving.length === 0) return;

    const orderedIds = moving.map((m) => m.userId);
    const strip = (members: LevelGroupMember[]) => members.filter((m) => !movingIds.has(m.userId));

    setBoard({
      groups: board.groups.map((group) => {
        const remaining = strip(group.members);
        return group.id === targetId ? { ...group, members: [...remaining, ...moving] } : { ...group, members: remaining };
      }),
      unassigned:
        targetId === UNASSIGNED
          ? [...strip(board.unassigned), ...moving].sort((a, b) => a.fullName.localeCompare(b.fullName))
          : strip(board.unassigned),
    });
    clearSelection();

    setSaving(true);
    const res = await levelGroupEndpoints.assign(facilityId, orderedIds, targetId === UNASSIGNED ? null : targetId);
    setSaving(false);
    if (!res.success) {
      hapticError();
      showAlert('Error', res.error || 'Failed to move players');
      await loadBoard();
    }
  };

  /** Promote (delta -1) or demote (delta +1) a player one tier. */
  const shiftTier = (userId: string, delta: number) => {
    const current = locationOf(userId);
    const currentIndex = current === UNASSIGNED ? board.groups.length : board.groups.findIndex((g) => g.id === current);
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex > board.groups.length) return;
    const targetId = targetIndex === board.groups.length ? UNASSIGNED : board.groups[targetIndex]!.id;
    void moveMembers([userId], targetId);
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setCreating(true);
    const res = await levelGroupEndpoints.createGroup(facilityId, name);
    setCreating(false);
    if (res.success) {
      hapticSuccess();
      setNewGroupName('');
      await loadBoard();
    } else {
      hapticError();
      showAlert('Error', res.error || 'Failed to create group');
    }
  };

  const handleRename = async (groupId: string) => {
    const name = renameValue.trim();
    const group = board.groups.find((g) => g.id === groupId);
    setRenamingGroupId(null);
    if (!name || name === group?.name) return;
    setBoard((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
    const res = await levelGroupEndpoints.updateGroup(facilityId, groupId, { name });
    if (!res.success) {
      showAlert('Error', res.error || 'Failed to rename group');
      await loadBoard();
    }
  };

  const handleToggleVisibility = async (group: LevelGroup) => {
    const isVisibleToPlayers = !group.isVisibleToPlayers;
    setBoard((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === group.id ? { ...g, isVisibleToPlayers } : g)),
    }));
    const res = await levelGroupEndpoints.updateGroup(facilityId, group.id, { isVisibleToPlayers });
    if (!res.success) {
      showAlert('Error', res.error || 'Failed to update visibility');
      await loadBoard();
    }
  };

  const handleDeleteGroup = (group: LevelGroup) => {
    const warning = group.members.length
      ? `Delete "${group.name}"? Its ${group.members.length} player(s) move back to Unassigned.`
      : `Delete "${group.name}"?`;
    showAlert('Delete group', warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await levelGroupEndpoints.deleteGroup(facilityId, group.id);
            if (res.success) await loadBoard();
            else showAlert('Error', res.error || 'Failed to delete group');
          })();
        },
      },
    ]);
  };

  /** Swap a tier with its neighbour (delta -1 up, +1 down). */
  const handleReorderGroup = async (index: number, delta: number) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= board.groups.length) return;
    const groups = [...board.groups];
    [groups[index], groups[targetIndex]] = [groups[targetIndex]!, groups[index]!];
    setBoard((prev) => ({ ...prev, groups }));
    const res = await levelGroupEndpoints.reorderGroups(
      facilityId,
      groups.map((g) => g.id)
    );
    if (!res.success) {
      showAlert('Error', res.error || 'Failed to reorder groups');
      await loadBoard();
    }
  };

  const handleMessageGroup = async (group: LevelGroup) => {
    setSaving(true);
    const res = await levelGroupEndpoints.createConversation(facilityId, group.id);
    setSaving(false);
    const conversationId = unwrapApiPayload<{ conversationId?: string }>(res.data)?.conversationId;
    if (res.success && conversationId) {
      hapticSuccess();
      router.push({ pathname: '/(tabs)/messages', params: { conversationId } });
    } else {
      hapticError();
      showAlert('Error', res.error || 'Failed to start group chat');
    }
  };

  const filteredUnassigned = useMemo(() => {
    const filter = rosterFilter.trim().toLowerCase();
    if (!filter) return board.unassigned;
    return board.unassigned.filter((m) => m.fullName.toLowerCase().includes(filter));
  }, [board.unassigned, rosterFilter]);

  const moveTargets: MoveTarget[] = useMemo(
    () => [...board.groups.map((g) => ({ id: g.id, label: g.name })), { id: UNASSIGNED, label: 'Unassigned' }],
    [board.groups]
  );

  /** One player row: tap to select, "⋮" for the move menu. */
  const renderMember = (member: LevelGroupMember, zoneId: string) => {
    const isSelected = selectedIds.has(member.userId);
    return (
      <TouchableOpacity
        key={member.userId}
        style={[styles.playerRow, isSelected && styles.playerRowSelected]}
        onPress={() => toggleSelected(member.userId)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${member.fullName}${isSelected ? ', selected' : ''}`}
      >
        <Ionicons
          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
          size={18}
          color={isSelected ? Colors.primary : Colors.border}
        />
        <Text style={styles.playerName} numberOfLines={1}>
          {member.fullName}
        </Text>
        {member.skillLevel ? (
          <View style={styles.badgeSm}>
            <Text style={styles.badgeSmText}>{member.skillLevel}</Text>
          </View>
        ) : null}
        {member.isFacilityAdmin ? (
          <View style={styles.badgeSm}>
            <Text style={styles.badgeSmText}>Admin</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.iconButtonSm}
          onPress={() => setMoveSheet({ kind: 'player', member, zoneId })}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Move ${member.fullName}`}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Player Groups' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Player Groups' }} />
        <EmptyState
          icon="people-outline"
          title="Could not load groups"
          description={loadError}
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            void loadBoard();
          }}
        />
      </>
    );
  }

  // Move sheet: options depend on what it's acting on.
  const sheetPlayerZone = moveSheet?.kind === 'player' ? moveSheet.zoneId : null;
  const sheetPlayerIndex =
    moveSheet?.kind === 'player'
      ? moveSheet.zoneId === UNASSIGNED
        ? board.groups.length
        : board.groups.findIndex((g) => g.id === moveSheet.zoneId)
      : -1;

  return (
    <>
      <Stack.Screen options={{ title: 'Player Groups' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.helpText}>
          Groups run strongest at the top. Tap a player to select, or use the menu on each player to move them.
          {saving ? <Text style={styles.savingText}>  Saving…</Text> : null}
        </Text>

        {/* Add level */}
        <View style={styles.addRow}>
          <Input
            style={[styles.input, styles.addInput]}
            placeholder="New group name (e.g. 3.5)"
            value={newGroupName}
            onChangeText={setNewGroupName}
            maxLength={80}
            onSubmitEditing={() => void handleCreateGroup()}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.primaryButton, (creating || !newGroupName.trim()) && styles.buttonDisabled]}
            onPress={() => void handleCreateGroup()}
            disabled={creating || !newGroupName.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add level"
          >
            <Ionicons name="add" size={18} color={Colors.textInverse} />
            <Text style={styles.primaryButtonText}>Add Level</Text>
          </TouchableOpacity>
        </View>

        {/* Selection bar */}
        {selectedIds.size > 0 ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>
              {selectedIds.size} player{selectedIds.size === 1 ? '' : 's'} selected
            </Text>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => setMoveSheet({ kind: 'selection' })}
              accessibilityRole="button"
              accessibilityLabel="Move selected to"
            >
              <Text style={styles.outlineButtonText}>Move selected to</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSelection} accessibilityRole="button" accessibilityLabel="Clear selection">
              <Text style={styles.linkText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Levels, strongest first */}
        {board.groups.length === 0 ? (
          <View style={[styles.card, styles.dashed]}>
            <Ionicons name="layers-outline" size={36} color={Colors.textMuted} style={styles.centerIcon} />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Add your first group above, then move players into it.</Text>
          </View>
        ) : (
          board.groups.map((group, index) => (
            <View key={group.id} style={styles.card}>
              <View style={styles.groupHeader}>
                <View style={styles.rankBubble}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                {renamingGroupId === group.id ? (
                  <Input
                    style={[styles.input, styles.renameInput]}
                    autoFocus
                    value={renameValue}
                    maxLength={80}
                    onChangeText={setRenameValue}
                    onBlur={() => void handleRename(group.id)}
                    onSubmitEditing={() => void handleRename(group.id)}
                    returnKeyType="done"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.groupNameButton}
                    onPress={() => {
                      setRenamingGroupId(group.id);
                      setRenameValue(group.name);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Rename ${group.name}`}
                  >
                    <Text style={styles.groupTitle} numberOfLines={1}>
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{group.members.length}</Text>
                </View>
              </View>

              <View style={styles.groupTools}>
                <View style={styles.visibilityWrap}>
                  <Ionicons
                    name={group.isVisibleToPlayers ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color={Colors.textMuted}
                  />
                  <Switch
                    value={group.isVisibleToPlayers}
                    onValueChange={() => void handleToggleVisibility(group)}
                    trackColor={{ true: Colors.primary, false: Colors.border }}
                    accessibilityLabel={
                      group.isVisibleToPlayers ? 'Players in this group can see it' : 'Hidden from players'
                    }
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.toolButton,
                    (group.members.length === 0 || group.members.length > GROUP_CHAT_LIMIT) && styles.buttonDisabled,
                  ]}
                  disabled={group.members.length === 0 || group.members.length > GROUP_CHAT_LIMIT}
                  onPress={() => void handleMessageGroup(group)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    group.members.length > GROUP_CHAT_LIMIT
                      ? `Group chats are limited to ${GROUP_CHAT_LIMIT} members`
                      : `Start a group chat with ${group.name}`
                  }
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
                  <Text style={styles.toolButtonText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButtonSm, index === 0 && styles.buttonDisabled]}
                  disabled={index === 0}
                  onPress={() => void handleReorderGroup(index, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${group.name} up`}
                >
                  <Ionicons name="chevron-up" size={18} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButtonSm, index === board.groups.length - 1 && styles.buttonDisabled]}
                  disabled={index === board.groups.length - 1}
                  onPress={() => void handleReorderGroup(index, 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${group.name} down`}
                >
                  <Ionicons name="chevron-down" size={18} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButtonSm}
                  onPress={() => handleDeleteGroup(group)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${group.name}`}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>

              <View style={styles.groupBody}>
                {group.members.length === 0 ? (
                  <Text style={styles.dropHint}>No players in this group yet</Text>
                ) : (
                  group.members.map((member) => renderMember(member, group.id))
                )}
              </View>
            </View>
          ))
        )}

        {/* Unassigned pool */}
        <View style={styles.card}>
          <View style={styles.groupHeader}>
            <Ionicons name="people-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.groupTitle}>Unassigned</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{board.unassigned.length}</Text>
            </View>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <Input
              style={[styles.input, styles.searchInput]}
              placeholder="Find a player…"
              value={rosterFilter}
              onChangeText={setRosterFilter}
              autoCorrect={false}
            />
          </View>
          <View style={styles.groupBody}>
            {filteredUnassigned.length === 0 ? (
              <Text style={styles.dropHint}>
                {board.unassigned.length === 0 ? 'Everyone is placed in a group' : 'No players match that search'}
              </Text>
            ) : (
              filteredUnassigned.map((member) => renderMember(member, UNASSIGNED))
            )}
          </View>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* Move sheet (stands in for web's per-player dropdown / "Move selected to") */}
      <Modal visible={moveSheet !== null} transparent animationType="fade" onRequestClose={() => setMoveSheet(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMoveSheet(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {moveSheet?.kind === 'player'
                ? `Move ${moveSheet.member.fullName}`
                : `Move ${selectedIds.size} selected player${selectedIds.size === 1 ? '' : 's'}`}
            </Text>
            {moveSheet?.kind === 'player' ? (
              <>
                <SheetOption
                  icon="arrow-up-outline"
                  label="Move up a level"
                  disabled={sheetPlayerIndex <= 0}
                  onPress={() => {
                    setMoveSheet(null);
                    shiftTier(moveSheet.member.userId, -1);
                  }}
                />
                <SheetOption
                  icon="arrow-down-outline"
                  label="Move down a level"
                  disabled={sheetPlayerIndex >= board.groups.length}
                  onPress={() => {
                    setMoveSheet(null);
                    shiftTier(moveSheet.member.userId, 1);
                  }}
                />
                <Text style={styles.sheetSection}>Move to</Text>
              </>
            ) : null}
            {moveTargets
              .filter((target) => target.id !== sheetPlayerZone)
              .map((target) => (
                <SheetOption
                  key={target.id}
                  icon={target.id === UNASSIGNED ? 'person-remove-outline' : 'layers-outline'}
                  label={target.label}
                  onPress={() => {
                    const ids =
                      moveSheet?.kind === 'player' ? [moveSheet.member.userId] : Array.from(selectedIds);
                    setMoveSheet(null);
                    void moveMembers(ids, target.id);
                  }}
                />
              ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function SheetOption({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.sheetOption, disabled && styles.buttonDisabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={18} color={Colors.text} />
      <Text style={styles.sheetOptionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dashed: { borderStyle: 'dashed', alignItems: 'center', paddingVertical: Spacing.xl },
  centerIcon: { marginBottom: Spacing.xs },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },
  groupName: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  badgeSmText: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },

  emptyInline: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.xs },
  emptyInlineText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  emptyTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontFamily: FontFamily.bold, fontWeight: '700', fontSize: FontSize.xs },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, fontWeight: '600', color: Colors.text },
  memberSkill: { fontSize: FontSize.xs, color: Colors.textSecondary },
  iconButton: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  iconButtonSm: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },

  helpText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  savingText: { color: Colors.textMuted },
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  addInput: { flex: 1 },
  renameInput: { flex: 1, paddingVertical: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  searchInput: { flex: 1, paddingVertical: 8 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    minHeight: TouchTarget.min,
  },
  primaryButtonText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.card,
  },
  outlineButtonText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  linkText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  buttonDisabled: { opacity: 0.4 },

  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  selectionText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, flex: 1 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rankBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  groupNameButton: { flex: 1, minWidth: 0 },
  groupTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  groupTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.sm,
  },
  visibilityWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  toolButtonText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  groupBody: { gap: 6 },
  dropHint: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.card,
  },
  playerRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  playerName: { flex: 1, minWidth: 0, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },

  sheetOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: 2,
  },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  sheetSection: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, marginBottom: 2 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    minHeight: TouchTarget.min,
  },
  sheetOptionText: { fontSize: FontSize.md, color: Colors.text },
});
