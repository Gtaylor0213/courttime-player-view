import express from 'express';
import { getUserById, getUserWithMemberships, updateUserProfile, deleteUser } from '../../src/services/authService';
import { requireAuth } from '../middleware/auth';
import { transaction } from '../../src/database/connection';

const router = express.Router();

/**
 * These routes operate on a user account identified by :id. A caller may only
 * act on their own account. Returns the authenticated user id when it matches
 * the requested id, otherwise writes a 401/403 and returns null.
 */
function requireSelf(req: express.Request, res: express.Response, requestedId: string): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }
  if (userId !== requestedId) {
    res.status(403).json({ success: false, error: 'Cannot access another user account' });
    return null;
  }
  return userId;
}

type DeleteTableOptions = {
  userColumn?: string;
  extraWhere?: string;
};

async function safeDeleteByUser(
  client: any,
  table: string,
  userId: string,
  options: DeleteTableOptions = {}
) {
  const userColumn = options.userColumn || 'user_id';
  const whereParts = [`${userColumn} = $1`];
  if (options.extraWhere) {
    whereParts.push(options.extraWhere);
  }
  try {
    await client.query(`DELETE FROM ${table} WHERE ${whereParts.join(' AND ')}`, [userId]);
  } catch (error: any) {
    if (error?.code !== '42P01') {
      throw error;
    }
  }
}

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!requireSelf(req, res, id)) return;
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id/memberships
 * Get user with memberships
 */
router.get('/:id/memberships', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!requireSelf(req, res, id)) return;
    const user = await getUserWithMemberships(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/:id
 * Update user profile
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!requireSelf(req, res, id)) return;

    // Never allow privilege fields (e.g. userType) to be changed through the
    // self-service profile endpoint — that would be account/role escalation.
    const { userType: _ignoredUserType, ...updates } = req.body ?? {};

    const success = await updateUserProfile(id, updates);

    if (success) {
      const user = await getUserById(id);
      res.json({
        success: true,
        user,
        message: 'Profile updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/me
 * Permanently delete authenticated user account and related data.
 */
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const deletedUserId = await transaction(async (client) => {
      await safeDeleteByUser(client, 'bookings', userId);
      await safeDeleteByUser(client, 'player_profiles', userId);
      await safeDeleteByUser(client, 'hitting_partner_posts', userId);
      await safeDeleteByUser(client, 'bulletin_posts', userId, { userColumn: 'author_id' });
      await safeDeleteByUser(client, 'bulletin_drill_signups', userId);
      await safeDeleteByUser(client, 'messages', userId, { userColumn: 'sender_id' });
      await safeDeleteByUser(client, 'conversations', userId, { userColumn: 'participant1_id' });
      await safeDeleteByUser(client, 'conversations', userId, { userColumn: 'participant2_id' });
      await safeDeleteByUser(client, 'notifications', userId);
      await safeDeleteByUser(client, 'household_members', userId);
      await safeDeleteByUser(client, 'strikes', userId);
      await safeDeleteByUser(client, 'user_preferences', userId);
      await safeDeleteByUser(client, 'facility_memberships', userId);
      await safeDeleteByUser(client, 'facility_admins', userId);

      const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
      return result.rows[0]?.id as string | undefined;
    });

    if (!deletedUserId) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/users/:id
 * Permanently delete user account and all associated data.
 * The user may only delete their own account.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Security: only allow self-deletion. Identity comes from the verified JWT,
    // never from a client-supplied body field.
    if (!requireSelf(req, res, id)) return;

    const result = await deleteUser(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
