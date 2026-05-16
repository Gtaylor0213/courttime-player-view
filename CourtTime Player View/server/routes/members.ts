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
    const validFields = ['membershipType', 'status', 'isFacilityAdmin', 'isViewOnly', 'isPaymentLocked', 'endDate', 'suspendedUntil'];
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
 * PUT /api/members/:facilityId/:userId/view-only
 * Set or clear view-only status for a member
 */
router.put('/:facilityId/:userId/view-only', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const { isViewOnly } = req.body;

    if (typeof isViewOnly !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isViewOnly must be a boolean value'
      });
    }

    const success = await updateMemberMembership(facilityId, userId, { isViewOnly });

    if (success) {
      const member = await getMemberDetails(facilityId, userId);
      res.json({
        success: true,
        member,
        message: `Member ${isViewOnly ? 'set to' : 'removed from'} view-only`
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
 * PUT /api/members/:facilityId/:userId/payment-lockout
 * Set or clear payment lockout for a member
 */
router.put('/:facilityId/:userId/payment-lockout', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const { isPaymentLocked } = req.body;

    if (typeof isPaymentLocked !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isPaymentLocked must be a boolean value'
      });
    }

    const success = await updateMemberMembership(facilityId, userId, { isPaymentLocked });

    if (success) {
      const member = await getMemberDetails(facilityId, userId);
      res.json({
        success: true,
        member,
        message: isPaymentLocked ? 'Member payment locked out' : 'Member payment lockout cleared'
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

/**
 * POST /api/members/:facilityId/:userId/lockout-payment
 * Admin: lock a member and record the amount they owe.
 * The lockout screen will generate a fresh Stripe checkout URL on demand.
 */
router.post('/:facilityId/:userId/lockout-payment', async (req, res, next) => {
  try {
    const { facilityId, userId } = req.params;
    const { amountCents, description } = req.body;

    if (!amountCents || typeof amountCents !== 'number' || amountCents <= 0) {
      return res.status(400).json({ success: false, error: 'amountCents must be a positive number' });
    }

    const success = await updateMemberMembership(facilityId, userId, {
      isPaymentLocked: true,
      lockoutAmountCents: amountCents,
      lockoutDescription: description || 'Account balance due',
    });

    if (!success) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    const member = await getMemberDetails(facilityId, userId);
    res.json({ success: true, member });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/members/:facilityId/me/lockout-info
 * Member: get their lockout details (amount + description).
 * NOT subject to the payment lockout middleware so locked members can call it.
 */
router.get('/:facilityId/me/lockout-info', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const member = await getMemberDetails(facilityId, userId);
    if (!member) return res.status(404).json({ success: false, error: 'Membership not found' });

    res.json({
      success: true,
      isLocked: member.isPaymentLocked,
      amountCents: (member as any).lockoutAmountCents ?? null,
      description: (member as any).lockoutDescription ?? null,
      lockedAt: member.paymentLockedAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/members/:facilityId/me/lockout-checkout
 * Member: generate a fresh Stripe checkout URL for their lockout payment.
 * NOT subject to the payment lockout middleware.
 */
router.post('/:facilityId/me/lockout-checkout', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const member = await getMemberDetails(facilityId, userId);
    if (!member || !member.isPaymentLocked) {
      return res.status(400).json({ success: false, error: 'No active payment lockout found' });
    }

    const amountCents = (member as any).lockoutAmountCents;
    const description = (member as any).lockoutDescription || 'Account balance due';

    if (!amountCents) {
      return res.status(400).json({ success: false, error: 'No payment amount set for this lockout. Contact your facility administrator.' });
    }

    const { createLockoutCheckoutSession } = await import('../../src/services/stripeConnectService');
    const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
    const result = await createLockoutCheckoutSession({
      facilityId,
      memberId: userId,
      amountCents,
      description,
      successUrl: `${origin}/lockout-paid?facilityId=${facilityId}`,
      cancelUrl: `${origin}/`,
    });

    res.json({ success: true, checkoutUrl: result.url });
  } catch (error: any) {
    next(error);
  }
});

export default router;
