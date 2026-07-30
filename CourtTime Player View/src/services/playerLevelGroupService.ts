/**
 * Player level groups -- ordered skill tiers a facility admin maintains from
 * the Messages section so players of similar ability can be grouped and
 * messaged together.
 *
 * Tiers are ordered strongest-first: sort_position 0 is the top tier, so
 * "promoting" a player means moving them to a lower sort_position. A player
 * belongs to at most one tier per facility (enforced by a UNIQUE constraint in
 * migration 078), which is what makes a drag a move rather than a copy.
 *
 * Assignments are only ever read back joined against active facility
 * memberships, so a player who leaves the facility silently drops off the board
 * without needing a cleanup job.
 */

import { query, transaction } from '../database/connection';

/** Thrown for caller mistakes; `status` is the HTTP status the route should return. */
export class PlayerLevelGroupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'PlayerLevelGroupError';
  }
}

const NAME_MAX_LENGTH = 80;

/** Postgres unique_violation — a tier name already exists in this facility. */
const UNIQUE_VIOLATION = '23505';

export interface LevelGroupMember {
  userId: string;
  fullName: string;
  /** Self-reported skill level from the player's profile, when they've set one. */
  skillLevel: string | null;
  isFacilityAdmin: boolean;
}

export interface LevelGroup {
  id: string;
  name: string;
  sortPosition: number;
  isVisibleToPlayers: boolean;
  members: LevelGroupMember[];
}

export interface LevelGroupBoard {
  groups: LevelGroup[];
  /** Active members not yet placed in any tier. */
  unassigned: LevelGroupMember[];
}

function validateName(rawName: unknown): string {
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new PlayerLevelGroupError('Group name is required');
  }
  const name = rawName.trim();
  if (name.length > NAME_MAX_LENGTH) {
    throw new PlayerLevelGroupError(`Group name must be ${NAME_MAX_LENGTH} characters or fewer`);
  }
  return name;
}

/** Narrows a request body array down to the string ids it actually contains. */
function toIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && !!id)));
}

/** Owning facility of a tier, or null when it doesn't exist. */
export async function facilityIdForLevelGroup(groupId: string): Promise<string | null> {
  const result = await query(`SELECT facility_id FROM player_level_groups WHERE id = $1`, [groupId]);
  return result.rows[0]?.facility_id ?? null;
}

/**
 * The whole board in one round trip: every tier with its members in order, plus
 * the unassigned pool. The admin UI needs all of it to render drag targets, and
 * refetches it after each move.
 */
export async function getBoard(facilityId: string): Promise<LevelGroupBoard> {
  const groupsResult = await query(
    `SELECT
       id,
       name,
       sort_position as "sortPosition",
       is_visible_to_players as "isVisibleToPlayers"
     FROM player_level_groups
     WHERE facility_id = $1
     ORDER BY sort_position ASC, created_at ASC`,
    [facilityId]
  );

  // Active membership is the source of truth for who appears on the board, for
  // both assigned and unassigned rows.
  const rosterResult = await query(
    `SELECT
       u.id as "userId",
       u.full_name as "fullName",
       pp.skill_level as "skillLevel",
       (fa.user_id IS NOT NULL) as "isFacilityAdmin",
       plgm.group_id as "groupId",
       plgm.sort_position as "memberSortPosition"
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     LEFT JOIN facility_admins fa
       ON fa.user_id = fm.user_id AND fa.facility_id = fm.facility_id AND fa.status = 'active'
     LEFT JOIN player_level_group_members plgm
       ON plgm.user_id = fm.user_id AND plgm.facility_id = fm.facility_id
     WHERE fm.facility_id = $1 AND fm.status = 'active'
     ORDER BY plgm.sort_position ASC NULLS LAST, u.full_name ASC`,
    [facilityId]
  );

  const membersByGroup = new Map<string, LevelGroupMember[]>();
  const unassigned: LevelGroupMember[] = [];

  for (const row of rosterResult.rows) {
    const member: LevelGroupMember = {
      userId: row.userId,
      fullName: row.fullName,
      skillLevel: row.skillLevel ?? null,
      isFacilityAdmin: row.isFacilityAdmin === true,
    };
    if (row.groupId) {
      const bucket = membersByGroup.get(row.groupId);
      if (bucket) bucket.push(member);
      else membersByGroup.set(row.groupId, [member]);
    } else {
      unassigned.push(member);
    }
  }

  const groups: LevelGroup[] = groupsResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortPosition: row.sortPosition,
    isVisibleToPlayers: row.isVisibleToPlayers === true,
    members: membersByGroup.get(row.id) ?? [],
  }));

  return { groups, unassigned };
}

/** Creates a tier at the bottom of the ladder. */
export async function createGroup(
  facilityId: string,
  rawName: unknown,
  createdBy: string
): Promise<LevelGroup> {
  const name = validateName(rawName);
  try {
    const result = await query(
      `INSERT INTO player_level_groups (facility_id, name, sort_position, created_by)
       VALUES (
         $1,
         $2,
         COALESCE((SELECT MAX(sort_position) + 1 FROM player_level_groups WHERE facility_id = $1), 0),
         $3
       )
       RETURNING id, name, sort_position as "sortPosition", is_visible_to_players as "isVisibleToPlayers"`,
      [facilityId, name, createdBy]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      sortPosition: row.sortPosition,
      isVisibleToPlayers: row.isVisibleToPlayers === true,
      members: [],
    };
  } catch (error: any) {
    if (error?.code === UNIQUE_VIOLATION) {
      throw new PlayerLevelGroupError(`A group named "${name}" already exists`, 409);
    }
    throw error;
  }
}

/**
 * Renames a tier and/or flips its player visibility. Both fields are optional;
 * omitted ones are left alone.
 */
export async function updateGroup(
  groupId: string,
  updates: { name?: unknown; isVisibleToPlayers?: unknown }
): Promise<void> {
  const assignments: string[] = [];
  const params: any[] = [groupId];

  if (updates.name !== undefined) {
    params.push(validateName(updates.name));
    assignments.push(`name = $${params.length}`);
  }
  if (updates.isVisibleToPlayers !== undefined) {
    params.push(updates.isVisibleToPlayers === true);
    assignments.push(`is_visible_to_players = $${params.length}`);
  }
  if (assignments.length === 0) {
    throw new PlayerLevelGroupError('Nothing to update');
  }

  try {
    const result = await query(
      `UPDATE player_level_groups SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`,
      params
    );
    if (result.rows.length === 0) {
      throw new PlayerLevelGroupError('Group not found', 404);
    }
  } catch (error: any) {
    if (error?.code === UNIQUE_VIOLATION) {
      throw new PlayerLevelGroupError('Another group already has that name', 409);
    }
    throw error;
  }
}

/** Deletes a tier. Its members cascade back to the unassigned pool. */
export async function deleteGroup(groupId: string): Promise<void> {
  const result = await query(`DELETE FROM player_level_groups WHERE id = $1 RETURNING id`, [groupId]);
  if (result.rows.length === 0) {
    throw new PlayerLevelGroupError('Group not found', 404);
  }
}

/**
 * Rewrites the tier order to exactly `groupIds`, top tier first. The caller
 * must pass every tier in the facility, so a stale board can't silently drop
 * a tier that another admin just created.
 */
export async function reorderGroups(facilityId: string, rawGroupIds: unknown): Promise<void> {
  const groupIds = toIdList(rawGroupIds);
  if (groupIds.length === 0) {
    throw new PlayerLevelGroupError('groupIds is required');
  }

  await transaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM player_level_groups WHERE facility_id = $1 FOR UPDATE`,
      [facilityId]
    );
    const existingIds = new Set(existing.rows.map((row: any) => row.id));
    if (existingIds.size !== groupIds.length || groupIds.some((id) => !existingIds.has(id))) {
      throw new PlayerLevelGroupError(
        'Group order is out of date — reload the board and try again',
        409
      );
    }

    await client.query(
      `UPDATE player_level_groups g
          SET sort_position = v.pos
         FROM (SELECT * FROM unnest($1::uuid[], $2::int[]) AS t(id, pos)) v
        WHERE g.id = v.id`,
      [groupIds, groupIds.map((_, index) => index)]
    );
  });
}

/**
 * Moves members onto a tier (or off the board when `groupId` is null) and
 * renumbers that tier. This is the single write behind every drag: dropping on
 * a tier, reordering within a tier, and dragging back to the unassigned pool.
 *
 * `position` is the index the moved members land at within the target tier;
 * omit it to append. Members are inserted in the order given.
 */
export async function assignMembers(
  facilityId: string,
  options: { groupId: string | null; userIds: unknown; position?: unknown; addedBy: string }
): Promise<void> {
  const userIds = toIdList(options.userIds);
  if (userIds.length === 0) {
    throw new PlayerLevelGroupError('userIds is required');
  }

  const position =
    typeof options.position === 'number' && Number.isFinite(options.position)
      ? Math.max(0, Math.floor(options.position))
      : null;

  await transaction(async (client) => {
    const membershipCheck = await client.query(
      `SELECT user_id FROM facility_memberships
        WHERE facility_id = $1 AND user_id = ANY($2::uuid[]) AND status = 'active'`,
      [facilityId, userIds]
    );
    if (membershipCheck.rows.length !== userIds.length) {
      throw new PlayerLevelGroupError(
        'Every player must be an active member of this facility',
        403
      );
    }

    if (options.groupId) {
      const group = await client.query(
        `SELECT id FROM player_level_groups WHERE id = $1 AND facility_id = $2`,
        [options.groupId, facilityId]
      );
      if (group.rows.length === 0) {
        throw new PlayerLevelGroupError('Group not found', 404);
      }
    }

    // Clearing prior assignments first keeps the one-tier-per-player invariant
    // and doubles as the "drag back to unassigned" path.
    await client.query(
      `DELETE FROM player_level_group_members WHERE facility_id = $1 AND user_id = ANY($2::uuid[])`,
      [facilityId, userIds]
    );

    const { groupId } = options;
    if (!groupId) return;

    const remaining = await client.query(
      `SELECT user_id FROM player_level_group_members
        WHERE group_id = $1
        ORDER BY sort_position ASC, created_at ASC`,
      [groupId]
    );
    const order = remaining.rows.map((row: any) => row.user_id as string);
    const insertAt = position === null ? order.length : Math.min(position, order.length);
    order.splice(insertAt, 0, ...userIds);

    const values = userIds.map((_, i) => `($1, $2, $${i + 4}, $3)`).join(', ');
    await client.query(
      `INSERT INTO player_level_group_members (group_id, facility_id, user_id, added_by)
       VALUES ${values}`,
      [groupId, facilityId, options.addedBy, ...userIds]
    );

    await client.query(
      `UPDATE player_level_group_members m
          SET sort_position = v.pos
         FROM (SELECT * FROM unnest($2::uuid[], $3::int[]) AS t(user_id, pos)) v
        WHERE m.group_id = $1 AND m.user_id = v.user_id`,
      [groupId, order, order.map((_, index) => index)]
    );
  });
}

export interface MyLevelGroup {
  /** The caller's tier, or null when they aren't in one (or it's hidden). */
  group: { id: string; name: string; rank: number; totalGroups: number } | null;
  /** Fellow members of that tier, excluding the caller. */
  members: { userId: string; fullName: string; skillLevel: string | null }[];
}

/**
 * The player-facing view: which tier the caller is in and who else is in it.
 * Returns an empty result unless the tier is flagged visible to players, so a
 * facility can use the board purely as an internal tool.
 */
export async function getMyLevelGroup(facilityId: string, userId: string): Promise<MyLevelGroup> {
  const groupResult = await query(
    `SELECT
       g.id,
       g.name,
       (SELECT COUNT(*) FROM player_level_groups WHERE facility_id = $1) as "totalGroups",
       (SELECT COUNT(*) FROM player_level_groups o
         WHERE o.facility_id = $1 AND o.sort_position < g.sort_position) as "higherTiers"
     FROM player_level_group_members m
     JOIN player_level_groups g ON g.id = m.group_id
     WHERE m.facility_id = $1 AND m.user_id = $2 AND g.is_visible_to_players = true`,
    [facilityId, userId]
  );

  const row = groupResult.rows[0];
  if (!row) return { group: null, members: [] };

  const membersResult = await query(
    `SELECT
       u.id as "userId",
       u.full_name as "fullName",
       pp.skill_level as "skillLevel"
     FROM player_level_group_members m
     JOIN facility_memberships fm
       ON fm.user_id = m.user_id AND fm.facility_id = m.facility_id AND fm.status = 'active'
     JOIN users u ON u.id = m.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE m.group_id = $1 AND m.user_id <> $2
     ORDER BY u.full_name ASC`,
    [row.id, userId]
  );

  return {
    group: {
      id: row.id,
      name: row.name,
      // 1-based rank from the top tier, for "Tier 2 of 5" style copy.
      rank: parseInt(row.higherTiers, 10) + 1,
      totalGroups: parseInt(row.totalGroups, 10),
    },
    members: membersResult.rows.map((memberRow: any) => ({
      userId: memberRow.userId,
      fullName: memberRow.fullName,
      skillLevel: memberRow.skillLevel ?? null,
    })),
  };
}
