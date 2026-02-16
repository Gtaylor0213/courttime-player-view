import express from 'express';
import {
  getFacilityMembers,
  getMemberDetails,
  updateMemberMembership,
  removeMemberFromFacility,
  addMemberToFacility,
  setMemberAsAdmin,
  isFacilityAdmin
} from '../../src/services/memberService';

const router = express.Router();

/**
 * GET /api/members/:facilityId
 * Get all members for a facility
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { search } = req.query;

    const members = await getFacilityMembers(
      facilityId,
      search && typeof search === 'string' ? search : undefined
    );

    res.json({
      success: true,
      members
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/members/:facilityId/:userId
 * Get a specific member's details
 */
router.get('/:facilityId/:userId', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const member = await getMemberDetails(facilityId, userId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }

    res.json({
      success: true,
      member
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/members/:facilityId/:userId
 * Update a member's facility membership
 */
router.patch('/:facilityId/:userId', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const updates = req.body;

    // Validate updates
    const validFields = ['membershipType', 'status', 'isFacilityAdmin', 'endDate', 'suspendedUntil'];
    const invalidFields = Object.keys(updates).filter(key => !validFields.includes(key));

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid fields: ${invalidFields.join(', ')}`
      });
    }

    const success = await updateMemberMembership(facilityId, userId, updates);

    if (success) {
      const member = await getMemberDetails(facilityId, userId);
      res.json({
        success: true,
        member,
        message: 'Member updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Member not found or no changes made'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/members/:facilityId/:userId
 * Remove a member from a facility (does NOT delete the user account)
 */
router.delete('/:facilityId/:userId', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;

    const success = await removeMemberFromFacility(facilityId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Member removed from facility successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/members/:facilityId
 * Add a new member to a facility
 */
router.post('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { userId, membershipType, isFacilityAdmin } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const success = await addMemberToFacility(
      facilityId,
      userId,
      membershipType || 'Full',
      isFacilityAdmin || false
    );

    if (success) {
      const member = await getMemberDetails(facilityId, userId);
      res.status(201).json({
        success: true,
        member,
        message: 'Member added to facility successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add member to facility'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/members/:facilityId/:userId/admin
 * Set a member as facility admin or remove admin status
 */
router.put('/:facilityId/:userId/admin', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const { isAdmin } = req.body;

    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isAdmin must be a boolean value'
      });
    }

    const success = await setMemberAsAdmin(facilityId, userId, isAdmin);

    if (success) {
      const member = await getMemberDetails(facilityId, userId);
      res.json({
        success: true,
        member,
        message: `Member ${isAdmin ? 'granted' : 'removed'} admin privileges`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Member not found'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/members/:facilityId/:userId/is-admin
 * Check if a user is a facility admin
 */
router.get('/:facilityId/:userId/is-admin', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const isAdmin = await isFacilityAdmin(facilityId, userId);

    res.json({
      success: true,
      isAdmin
    });
  } catch (error) {
    next(error);
  }
});

export default router;
