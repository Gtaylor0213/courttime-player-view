import express from 'express';
import {
  getPlayerProfile,
  updatePlayerProfile,
  requestFacilityMembership,
  getUserBookings
} from '../../src/services/playerProfileService';

const router = express.Router();

/**
 * GET /api/player-profile/:userId
 * Get player profile with memberships
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await getPlayerProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Player profile not found'
      });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/player-profile/:userId
 * Update player profile
 */
router.patch('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    const success = await updatePlayerProfile(userId, updates);

    if (success) {
      const profile = await getPlayerProfile(userId);
      res.json({
        success: true,
        profile,
        message: 'Profile updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No valid updates provided'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/player-profile/:userId/request-membership
 * Request membership to a facility
 */
router.post('/:userId/request-membership', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId, membershipType } = req.body;

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId is required'
      });
    }

    const success = await requestFacilityMembership(userId, facilityId, membershipType);

    if (success) {
      res.json({
        success: true,
        message: 'Membership request submitted successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to request membership'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/player-profile/:userId/bookings
 * Get user's bookings
 */
router.get('/:userId/bookings', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { upcoming } = req.query;

    const bookings = await getUserBookings(userId, upcoming !== 'false');

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

export default router;
