/**
 * Player Level Groups board (admin, player_level_groups feature flag).
 *
 * Tiers are listed strongest-first. Every move — drag, dropdown, or the
 * promote/demote arrows — funnels through moveMembers(), which updates local
 * state optimistically and then persists, so sorting a roster feels immediate.
 *
 * Drag-and-drop uses the native HTML5 API, which touch devices don't fire. The
 * per-player menu and the bulk "Move selected" control are the equivalent path
 * on mobile, not an afterthought.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Switch } from '../ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  playerLevelGroupsApi,
  type LevelGroup,
  type LevelGroupBoard,
  type LevelGroupMember,
} from '../../api/client';

/** Group chats are capped at 30 including the creator (see groupConversationService). */
const GROUP_CHAT_LIMIT = 30;

/** Sentinel for the unassigned pool, which has no group id. */
const UNASSIGNED = '__unassigned__';

interface PlayerLevelGroupsProps {
  facilityId: string;
}

/** Empty board, so render paths never have to null-check. */
const EMPTY_BOARD: LevelGroupBoard = { groups: [], unassigned: [] };

export function PlayerLevelGroups({ facilityId }: PlayerLevelGroupsProps) {
  const navigate = useNavigate();
  const [board, setBoard] = useState<LevelGroupBoard>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [rosterFilter, setRosterFilter] = useState('');

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // The players being dragged. A ref (not state) because dragover/drop fire far
  // too often to re-render on, and dataTransfer can't carry a list reliably.
  const dragPayload = useRef<string[]>([]);

  const loadBoard = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await playerLevelGroupsApi.getBoard(facilityId);
      if (response.success && response.board) {
        setBoard(response.board);
      } else {
        setLoadError(response.error || 'Failed to load level groups');
      }
    } catch (error) {
      console.error('Error loading level groups:', error);
      setLoadError('Failed to load level groups');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // A player who moves out of the pool shouldn't stay selected invisibly.
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
        if (group.members.some((member) => member.userId === userId)) return group.id;
      }
      return UNASSIGNED;
    },
    [board]
  );

  /**
   * Move players to a tier (or the unassigned pool), landing before
   * `beforeUserId` when given and at the end otherwise.
   *
   * Applies the change locally first, then persists. On failure the board is
   * reloaded from the server rather than hand-rolling an undo.
   */
  const moveMembers = async (
    userIds: string[],
    targetId: string,
    beforeUserId?: string
  ): Promise<void> => {
    if (userIds.length === 0) return;

    const movingIds = new Set(userIds);
    // Collect the member records in board order so multi-moves keep their
    // relative arrangement, and so we send the same order the server splices in.
    const moving: LevelGroupMember[] = [];
    for (const group of board.groups) {
      for (const member of group.members) if (movingIds.has(member.userId)) moving.push(member);
    }
    for (const member of board.unassigned) if (movingIds.has(member.userId)) moving.push(member);
    if (moving.length === 0) return;

    const orderedIds = moving.map((member) => member.userId);
    const strip = (members: LevelGroupMember[]) =>
      members.filter((member) => !movingIds.has(member.userId));

    let position: number | undefined;
    const nextBoard: LevelGroupBoard = {
      groups: board.groups.map((group) => {
        const remaining = strip(group.members);
        if (group.id !== targetId) return { ...group, members: remaining };

        const beforeIndex = beforeUserId
          ? remaining.findIndex((member) => member.userId === beforeUserId)
          : -1;
        position = beforeIndex === -1 ? remaining.length : beforeIndex;
        const members = [...remaining];
        members.splice(position, 0, ...moving);
        return { ...group, members };
      }),
      unassigned:
        targetId === UNASSIGNED
          ? [...strip(board.unassigned), ...moving].sort((a, b) =>
              a.fullName.localeCompare(b.fullName)
            )
          : strip(board.unassigned),
    };

    setBoard(nextBoard);
    clearSelection();

    try {
      setSaving(true);
      const response = await playerLevelGroupsApi.assign(
        facilityId,
        orderedIds,
        targetId === UNASSIGNED ? null : targetId,
        position
      );
      if (!response.success) {
        toast.error(response.error || 'Failed to move players');
        await loadBoard();
      }
    } catch (error) {
      console.error('Error moving players:', error);
      toast.error('Failed to move players');
      await loadBoard();
    } finally {
      setSaving(false);
    }
  };

  /** Promote (delta -1) or demote (delta +1) a player one tier. */
  const shiftTier = (userId: string, delta: number) => {
    const current = locationOf(userId);
    const currentIndex =
      current === UNASSIGNED
        ? board.groups.length
        : board.groups.findIndex((group) => group.id === current);
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex > board.groups.length) return;
    const targetId =
      targetIndex === board.groups.length ? UNASSIGNED : board.groups[targetIndex].id;
    void moveMembers([userId], targetId);
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      setCreating(true);
      const response = await playerLevelGroupsApi.createGroup(facilityId, name);
      if (response.success) {
        setNewGroupName('');
        await loadBoard();
      } else {
        toast.error(response.error || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (groupId: string) => {
    const name = renameValue.trim();
    const group = board.groups.find((candidate) => candidate.id === groupId);
    setRenamingGroupId(null);
    if (!name || name === group?.name) return;

    setBoard((prev) => ({
      ...prev,
      groups: prev.groups.map((candidate) =>
        candidate.id === groupId ? { ...candidate, name } : candidate
      ),
    }));

    const response = await playerLevelGroupsApi.updateGroup(facilityId, groupId, { name });
    if (!response.success) {
      toast.error(response.error || 'Failed to rename group');
      await loadBoard();
    }
  };

  const handleToggleVisibility = async (group: LevelGroup) => {
    const isVisibleToPlayers = !group.isVisibleToPlayers;
    setBoard((prev) => ({
      ...prev,
      groups: prev.groups.map((candidate) =>
        candidate.id === group.id ? { ...candidate, isVisibleToPlayers } : candidate
      ),
    }));

    const response = await playerLevelGroupsApi.updateGroup(facilityId, group.id, {
      isVisibleToPlayers,
    });
    if (!response.success) {
      toast.error(response.error || 'Failed to update visibility');
      await loadBoard();
    }
  };

  const handleDeleteGroup = async (group: LevelGroup) => {
    const warning = group.members.length
      ? `Delete "${group.name}"? Its ${group.members.length} player(s) move back to Unassigned.`
      : `Delete "${group.name}"?`;
    if (!window.confirm(warning)) return;

    const response = await playerLevelGroupsApi.deleteGroup(facilityId, group.id);
    if (response.success) await loadBoard();
    else toast.error(response.error || 'Failed to delete group');
  };

  /** Swap a tier with its neighbour (delta -1 up, +1 down). */
  const handleReorderGroup = async (index: number, delta: number) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= board.groups.length) return;

    const groups = [...board.groups];
    [groups[index], groups[targetIndex]] = [groups[targetIndex], groups[index]];
    setBoard((prev) => ({ ...prev, groups }));

    const response = await playerLevelGroupsApi.reorderGroups(
      facilityId,
      groups.map((group) => group.id)
    );
    if (!response.success) {
      toast.error(response.error || 'Failed to reorder groups');
      await loadBoard();
    }
  };

  const handleMessageGroup = async (group: LevelGroup) => {
    try {
      setSaving(true);
      const response = await playerLevelGroupsApi.createConversation(facilityId, group.id);
      if (response.success && response.conversationId) {
        toast.success(`Started a group chat with ${group.name}`);
        navigate(`/messages?conversationId=${response.conversationId}`);
      } else {
        toast.error(response.error || 'Failed to start group chat');
      }
    } catch (error) {
      console.error('Error starting group chat:', error);
      toast.error('Failed to start group chat');
    } finally {
      setSaving(false);
    }
  };

  // ── Drag and drop ────────────────────────────────────────────────────────
  // Dragging a selected player carries the whole selection; dragging an
  // unselected one carries just that player.

  const handleDragStart = (event: React.DragEvent, userId: string) => {
    dragPayload.current = selectedIds.has(userId) ? Array.from(selectedIds) : [userId];
    event.dataTransfer.effectAllowed = 'move';
    // Firefox refuses to start a drag unless some data is set.
    event.dataTransfer.setData('text/plain', userId);
  };

  const handleDragOverZone = (event: React.DragEvent, zoneId: string) => {
    if (dragPayload.current.length === 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTarget !== zoneId) setDropTarget(zoneId);
  };

  const handleDrop = (event: React.DragEvent, zoneId: string, beforeUserId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragPayload.current;
    dragPayload.current = [];
    setDropTarget(null);
    if (payload.length === 0) return;
    // Dropping onto a player that is itself being dragged is a no-op.
    if (beforeUserId && payload.includes(beforeUserId)) return;
    void moveMembers(payload, zoneId, beforeUserId);
  };

  const filteredUnassigned = useMemo(() => {
    const filter = rosterFilter.trim().toLowerCase();
    if (!filter) return board.unassigned;
    return board.unassigned.filter((member) => member.fullName.toLowerCase().includes(filter));
  }, [board.unassigned, rosterFilter]);

  const moveTargets = useMemo(
    () => [
      ...board.groups.map((group) => ({ id: group.id, label: group.name })),
      { id: UNASSIGNED, label: 'Unassigned' },
    ],
    [board.groups]
  );

  /** One player row. Draggable, selectable, and a drop target for insert-before. */
  const renderMember = (member: LevelGroupMember, zoneId: string) => {
    const isSelected = selectedIds.has(member.userId);
    const currentIndex =
      zoneId === UNASSIGNED
        ? board.groups.length
        : board.groups.findIndex((group) => group.id === zoneId);

    return (
      <div
        key={member.userId}
        draggable
        onDragStart={(event) => handleDragStart(event, member.userId)}
        onDragOver={(event) => {
          // Without this the parent zone's dragover would win and the
          // insert-before indicator would never appear.
          event.stopPropagation();
          handleDragOverZone(event, `${zoneId}:${member.userId}`);
        }}
        onDrop={(event) => handleDrop(event, zoneId, member.userId)}
        onClick={() => toggleSelected(member.userId)}
        className={cn(
          'group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm cursor-grab select-none transition-colors',
          isSelected
            ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
          dropTarget === `${zoneId}:${member.userId}` && 'border-t-2 border-t-green-600'
        )}
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-400" />
        <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
          {member.fullName}
        </span>
        {member.skillLevel && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {member.skillLevel}
          </Badge>
        )}
        {member.isFacilityAdmin && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            Admin
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-gray-400 hover:text-gray-700"
              aria-label={`Move ${member.fullName}`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={currentIndex <= 0}
              onClick={() => shiftTier(member.userId, -1)}
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              Move up a level
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={currentIndex >= board.groups.length}
              onClick={() => shiftTier(member.userId, 1)}
            >
              <ArrowDown className="mr-2 h-4 w-4" />
              Move down a level
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-gray-500">Move to</DropdownMenuLabel>
            {moveTargets
              .filter((target) => target.id !== zoneId)
              .map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => void moveMembers([member.userId], target.id)}
                >
                  {target.id === UNASSIGNED ? (
                    <UserMinus className="mr-2 h-4 w-4" />
                  ) : (
                    <Layers className="mr-2 h-4 w-4" />
                  )}
                  {target.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-green-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="text-sm text-gray-600">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={loadBoard}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Levels run strongest at the top. Drag players between levels, or use the menu on each
          player. {saving && <span className="text-gray-400">Saving…</span>}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="New level name (e.g. 3.5)"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreateGroup();
            }}
            maxLength={80}
            className="sm:w-56"
          />
          <Button onClick={handleCreateGroup} disabled={creating || !newGroupName.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            Add Level
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <span className="text-sm font-medium text-green-900">
            {selectedIds.size} player{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="bg-white">
                Move selected to
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => void moveMembers(Array.from(selectedIds), target.id)}
                >
                  {target.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        {/* Levels, strongest first */}
        <div className="space-y-3">
          {board.groups.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center">
              <Layers className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">No levels yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Add your first level above, then drag players into it.
              </p>
            </div>
          ) : (
            board.groups.map((group, index) => (
              <Card
                key={group.id}
                onDragOver={(event) => handleDragOverZone(event, group.id)}
                onDragLeave={() => setDropTarget((prev) => (prev === group.id ? null : prev))}
                onDrop={(event) => handleDrop(event, group.id)}
                className={cn(
                  'transition-colors',
                  dropTarget === group.id && 'border-green-500 bg-green-50/50'
                )}
              >
                <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 border-b px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {index + 1}
                    </span>
                    {renamingGroupId === group.id ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        maxLength={80}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={() => void handleRename(group.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleRename(group.id);
                          if (event.key === 'Escape') setRenamingGroupId(null);
                        }}
                        className="h-8 max-w-48"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingGroupId(group.id);
                          setRenameValue(group.name);
                        }}
                        className="truncate rounded px-1 text-base font-semibold text-gray-900 hover:bg-gray-100"
                        title="Rename level"
                      >
                        {group.name}
                      </button>
                    )}
                    <Badge variant="secondary" className="shrink-0">
                      {group.members.length}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1">
                    <label
                      className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs text-gray-500"
                      title={
                        group.isVisibleToPlayers
                          ? 'Players in this level can see it'
                          : 'Hidden from players'
                      }
                    >
                      {group.isVisibleToPlayers ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      <Switch
                        checked={group.isVisibleToPlayers}
                        onCheckedChange={() => void handleToggleVisibility(group)}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        group.members.length === 0 || group.members.length > GROUP_CHAT_LIMIT
                      }
                      onClick={() => void handleMessageGroup(group)}
                      title={
                        group.members.length > GROUP_CHAT_LIMIT
                          ? `Group chats are limited to ${GROUP_CHAT_LIMIT} members`
                          : 'Start a group chat with this level'
                      }
                    >
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Message
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === 0}
                      onClick={() => void handleReorderGroup(index, -1)}
                      aria-label={`Move ${group.name} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === board.groups.length - 1}
                      onClick={() => void handleReorderGroup(index, 1)}
                      aria-label={`Move ${group.name} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => void handleDeleteGroup(group)}
                      aria-label={`Delete ${group.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-3">
                  {group.members.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      Drop players here
                    </p>
                  ) : (
                    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                      {group.members.map((member) => renderMember(member, group.id))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Unassigned pool */}
        <Card
          onDragOver={(event) => handleDragOverZone(event, UNASSIGNED)}
          onDragLeave={() => setDropTarget((prev) => (prev === UNASSIGNED ? null : prev))}
          onDrop={(event) => handleDrop(event, UNASSIGNED)}
          className={cn(
            'self-start transition-colors lg:sticky lg:top-4',
            dropTarget === UNASSIGNED && 'border-green-500 bg-green-50/50'
          )}
        >
          <CardHeader className="space-y-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">Unassigned</span>
              <Badge variant="secondary">{board.unassigned.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Find a player…"
                value={rosterFilter}
                onChange={(event) => setRosterFilter(event.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1.5 overflow-y-auto p-3">
            {filteredUnassigned.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                {board.unassigned.length === 0
                  ? 'Everyone is placed in a level'
                  : 'No players match that search'}
              </p>
            ) : (
              filteredUnassigned.map((member) => renderMember(member, UNASSIGNED))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
