/**
 * Player Level Groups API
 *
 * Facility admins organize members into ordered skill tiers and message a whole
 * tier at once. Every route is gated on the player_level_groups feature flag,
 * and every write additionally requires facility-admin access — players only
 * ever reach GET /:facilityId/me.
 */

import express from 'express';
import { query } from '../../src/database/connection';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { ensureFacilityAdmin } from '../middleware/facilityAdmin';
import {
  GROUP_MEMBER_LIMIT,
  GroupConversationError,
  createGroupConversation,
} from '../../src/services/groupConversationService';
import {
  PlayerLevelGroupError,
  assignMembers,
  createGroup,
  deleteGroup,
  facilityIdForLevelGroup,
  getBoard,
  getMyLevelGroup,
  reorderGroups,
  updateGroup,
} from '../../src/services/playerLevelGroupService';

const router = express.Router();

/** False (and responds) when the facility doesn't have the feature turned on. */
async function ensureFlag(facilityId: string, res: express.Response): Promise<boolean> {
  if (!(await isFeatureEnabled(facilityId, FEATURE_FLAGS.PLAYER_LEVEL_GROUPS))) {
    res.status(403).json({
      success: false,
      error: 'Player level groups are not enabled for this facility',
    });
    return false;
  }
  return true;
}

/** Flag check plus facility-admin authorization, in that order. */
async function ensureAdminAccess(
  facilityId: string,
  req: express.Request,
  res: express.Response
): Promise<boolean> {
  if (!(await ensureFlag(facilityId, res))) return false;
  return ensureFacilityAdmin(facilityId, req.user?.userId, res);
}

/**
 * Confirms a tier belongs to `facilityId` before it is mutated, so a tier id
 * from one facility can't be edited through another facility's admin rights.
 */
async function ensureGroupInFacility(
  facilityId: string,
  groupId: string,
  res: express.Response
): Promise<boolean> {
  const owner = await facilityIdForLevelGroup(groupId);
  if (owner !== facilityId) {
    res.status(404).json({ success: false, error: 'Group not found' });
    return false;
  }
  return true;
}

/** Maps service-level errors onto responses; anything else is a 500. */
function handleError(error: any, res: express.Response, context: string) {
  if (error instanceof PlayerLevelGroupError || error instanceof GroupConversationError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  console.error(context, error);
  res.status(500).json({ success: false, error: error.message });
}

/**
 * GET /api/player-level-groups/:facilityId/me
 * Player-facing: the caller's own tier and who else is in it. Empty when their
 * tier isn't flagged visible to players.
 */
router.get('/:facilityId/me', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!(await ensureFlag(facilityId, res))) return;

    const membership = await query(
      `SELECT 1 FROM facility_memberships
        WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
      [facilityId, userId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not a member of this facility' });
    }

    const result = await getMyLevelGroup(facilityId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(error, res, 'Error fetching own level group:');
  }
});

/**
 * GET /api/player-level-groups/:facilityId
 * The full admin board: every tier with its members, plus unassigned members.
 */
router.get('/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;

    const board = await getBoard(facilityId);
    res.json({ success: true, data: board });
  } catch (error: any) {
    handleError(error, res, 'Error fetching level group board:');
  }
});

/**
 * POST /api/player-level-groups/:facilityId/groups
 * Create a tier at the bottom of the ladder.
 */
router.post('/:facilityId/groups', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;

    const group = await createGroup(facilityId, req.body?.name, req.user!.userId);
    res.json({ success: true, data: { group } });
  } catch (error: any) {
    handleError(error, res, 'Error creating level group:');
  }
});

/**
 * PUT /api/player-level-groups/:facilityId/groups/order
 * Reorder the ladder. Body: { groupIds: [...] }, top tier first.
 */
router.put('/:facilityId/groups/order', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;

    await reorderGroups(facilityId, req.body?.groupIds);
    res.json({ success: true, data: { reordered: true } });
  } catch (error: any) {
    handleError(error, res, 'Error reordering level groups:');
  }
});

/**
 * PATCH /api/player-level-groups/:facilityId/groups/:groupId
 * Rename a tier and/or toggle whether players can see it.
 */
router.patch('/:facilityId/groups/:groupId', async (req, res) => {
  try {
    const { facilityId, groupId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;
    if (!(await ensureGroupInFacility(facilityId, groupId, res))) return;

    await updateGroup(groupId, {
      name: req.body?.name,
      isVisibleToPlayers: req.body?.isVisibleToPlayers,
    });
    res.json({ success: true, data: { updated: true } });
  } catch (error: any) {
    handleError(error, res, 'Error updating level group:');
  }
});

/**
 * DELETE /api/player-level-groups/:facilityId/groups/:groupId
 * Delete a tier; its members return to the unassigned pool.
 */
router.delete('/:facilityId/groups/:groupId', async (req, res) => {
  try {
    const { facilityId, groupId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;
    if (!(await ensureGroupInFacility(facilityId, groupId, res))) return;

    await deleteGroup(groupId);
    res.json({ success: true, data: { deletedId: groupId } });
  } catch (error: any) {
    handleError(error, res, 'Error deleting level group:');
  }
});

/**
 * PUT /api/player-level-groups/:facilityId/assignments
 * The write behind every drag. Body: { userIds, groupId, position? } —
 * groupId null moves the players back to the unassigned pool.
 */
router.put('/:facilityId/assignments', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;

    const rawGroupId = req.body?.groupId;
    await assignMembers(facilityId, {
      groupId: typeof rawGroupId === 'string' && rawGroupId ? rawGroupId : null,
      userIds: req.body?.userIds,
      position: req.body?.position,
      addedBy: req.user!.userId,
    });
    res.json({ success: true, data: { assigned: true } });
  } catch (error: any) {
    handleError(error, res, 'Error assigning level group members:');
  }
});

/**
 * POST /api/player-level-groups/:facilityId/groups/:groupId/conversation
 * Start a group chat containing the tier's current members. This is a snapshot,
 * not a live mirror — later tier changes don't alter the conversation, which is
 * why the admin can create a fresh one whenever they need to.
 */
router.post('/:facilityId/groups/:groupId/conversation', async (req, res) => {
  try {
    const { facilityId, groupId } = req.params;
    if (!(await ensureAdminAccess(facilityId, req, res))) return;
    if (!(await ensureGroupInFacility(facilityId, groupId, res))) return;

    const callerId = req.user!.userId;
    const board = await getBoard(facilityId);
    const group = board.groups.find((candidate) => candidate.id === groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const memberIds = group.members
      .map((member) => member.userId)
      .filter((userId) => userId !== callerId);
    if (memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'This group has no other members to message yet',
      });
    }
    if (memberIds.length + 1 > GROUP_MEMBER_LIMIT) {
      return res.status(400).json({
        success: false,
        error: `Group chats are limited to ${GROUP_MEMBER_LIMIT} members — this group has ${group.members.length}`,
      });
    }

    // A tier can be messaged repeatedly, so the name is suffixed to keep the
    // conversation list readable when several chats exist for one tier.
    const existingCount = await query(
      `SELECT COUNT(*) as count FROM conversations
        WHERE facility_id = $1 AND is_group = true AND created_by = $2 AND name LIKE $3`,
      [facilityId, callerId, `${group.name}%`]
    );
    const suffix = parseInt(existingCount.rows[0]?.count ?? '0', 10);
    const name = suffix === 0 ? group.name : `${group.name} (${suffix + 1})`;

    const created = await createGroupConversation({
      facilityId,
      name,
      creatorId: callerId,
      memberIds,
    });
    res.json({ success: true, data: created });
  } catch (error: any) {
    handleError(error, res, 'Error creating conversation for level group:');
  }
});

export default router;
