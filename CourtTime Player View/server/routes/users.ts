import express from 'express';
import { getUserById, getUserWithMemberships, updateUserProfile, deleteUser } from '../../src/services/authService';
import { deleteUserAccount, SoleFacilityAdminError } from '../../src/services/accountDeletionService';
import { requireAuth } from '../middleware/auth';

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
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // One implementation for both delete routes. This one used to hard-delete
    // the member's bookings and user row, which destroyed the anonymized
    // booking history legal/ACCOUNT_DELETION.md promises facilities keep, and
    // failed outright for anyone with pro-shop history (those tables reference
    // users ON DELETE RESTRICT).
    const summary = await deleteUserAccount(userId);
    return res.json({ success: true, data: summary });
  } catch (error: any) {
    if (error instanceof SoleFacilityAdminError) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (error?.message === 'Account not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error?.message?.includes('already been deleted')) {
      return res.status(410).json({ success: false, error: error.message });
    }
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
