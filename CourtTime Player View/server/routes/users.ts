import express from 'express';
import { getUserById, getUserWithMemberships, updateUserProfile } from '../../src/services/authService';

const router = express.Router();

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
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
    const updates = req.body;

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

export default router;
