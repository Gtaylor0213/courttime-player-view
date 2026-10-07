import express from 'express';
import {
  validatePromoCode,
  createCheckoutSession,
  createFacilitySubscriptionCheckout,
  verifyCheckoutSession,
  createPortalSession,
  getSubscriptionByFacilityId,
  getPaymentHistory,
  cancelSubscription,
} from '../../src/services/paymentService';
import { getAmountForCourts } from '../../src/services/subscriptionPricing';
import { finalizeCourtAddPayment } from '../../src/services/courtAddService';
import { requireAuth } from '../middleware/auth';
import { isFacilityAdmin } from '../../src/services/memberService';
import { query } from '../../src/database/connection';

async function resolveExpectedAmountCents(
  courtCount: number,
  promoCode?: string
): Promise<{ expected: number; promoError?: string }> {
  const baseAmount = getAmountForCourts(courtCount);
  if (!promoCode?.trim()) {
    return { expected: baseAmount };
  }
  const promo = await validatePromoCode(promoCode.trim(), courtCount);
  if (!promo.valid) {
    return { expected: baseAmount, promoError: promo.message || 'Invalid promo code' };
  }
  return { expected: promo.finalAmountCents ?? baseAmount };
}

const router = express.Router();

/**
 * POST /api/payments/validate-promo
 * Validate a promo code and return discount info
 */
router.post('/validate-promo', async (req, res, next) => {
  try {
    const { code, courtCount, baseAmountCents } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Promo code is required' });
    }

    const parsedCourtCount =
      courtCount != null && Number.isFinite(Number(courtCount)) ? Number(courtCount) : undefined;
    const parsedBaseAmount =
      baseAmountCents != null && Number.isFinite(Number(baseAmountCents)) ? Number(baseAmountCents) : undefined;
    const context = parsedBaseAmount != null ? 'court_add' as const : 'subscription' as const;

    const result = await validatePromoCode(code.trim(), {
      courtCount: parsedCourtCount,
      baseAmountCents: parsedBaseAmount,
      context,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/create-checkout-session
 * Create a Stripe Checkout Session
 */
router.post('/create-checkout-session', async (req, res, next) => {
  try {
    const { facilityName, courtCount, amountCents, promoCode, successUrl, cancelUrl } = req.body;

    if (!facilityName || courtCount == null || !successUrl || !cancelUrl) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const parsedCourtCount = Number(courtCount);
    if (!Number.isFinite(parsedCourtCount) || parsedCourtCount < 1) {
      return res.status(400).json({ success: false, error: 'Invalid court count' });
    }

    const { expected, promoError } = await resolveExpectedAmountCents(parsedCourtCount, promoCode);
    if (promoError) {
      return res.status(400).json({ success: false, error: promoError });
    }

    const clientAmount =
      amountCents != null && Number.isFinite(Number(amountCents)) ? Number(amountCents) : expected;
    if (clientAmount !== expected) {
      return res.status(400).json({ success: false, error: 'Payment amount does not match expected subscription price' });
    }

    const result = await createCheckoutSession({
      facilityName,
      courtCount: parsedCourtCount,
      amountCents: expected,
      promoCode,
      successUrl,
      cancelUrl,
    });

    if (result.error) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/verify-session
 * Verify a completed Stripe Checkout Session
 */
router.post('/verify-session', async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }

    const result = await verifyCheckoutSession(sessionId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/facility-checkout
 * Create Stripe Checkout for an existing facility that still needs to pay (annual recurring subscription).
 */
router.post('/facility-checkout', requireAuth, async (req, res, next) => {
  try {
    const { facilityId, returnUrl } = req.body;
    const userId = req.user?.userId;

    if (!facilityId || !returnUrl) {
      return res.status(400).json({ success: false, error: 'Facility ID and return URL are required' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const adminFromTable = await query(
      `SELECT 1 FROM facility_admins
       WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
      [facilityId, userId]
    );
    const isAdmin =
      adminFromTable.rows.length > 0 || (await isFacilityAdmin(facilityId, userId));
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Facility admin access required' });
    }

    const result = await createFacilitySubscriptionCheckout(facilityId, returnUrl);
    if (result.error) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/portal-session
 * Create a Stripe Customer Portal session for managing billing
 */
router.post('/portal-session', requireAuth, async (req, res, next) => {
  try {
    const { facilityId, returnUrl } = req.body;
    if (!facilityId || !returnUrl) {
      return res.status(400).json({ success: false, error: 'Facility ID and return URL are required' });
    }

    const result = await createPortalSession(facilityId, returnUrl);
    if (result.error) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: { url: result.url } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/payments/subscription/:facilityId
 * Get subscription status for a facility
 */
router.get('/subscription/:facilityId', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const subscription = await getSubscriptionByFacilityId(facilityId);
    res.json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/payments/history/:facilityId
 * Get payment history for a facility
 */
router.get('/history/:facilityId', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const history = await getPaymentHistory(facilityId);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/court-add/confirm
 * Confirm a completed court-add Stripe checkout (redirect fallback).
 */
router.post('/court-add/confirm', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, facilityId } = req.body;
    const userId = req.user?.userId;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID is required' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (facilityId) {
      const adminFromTable = await query(
        `SELECT 1 FROM facility_admins
         WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
        [facilityId, userId]
      );
      const isAdmin =
        adminFromTable.rows.length > 0 || (await isFacilityAdmin(facilityId, userId));
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Facility admin access required' });
      }
    }

    const result = await finalizeCourtAddPayment(sessionId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Payment could not be verified' });
    }

    res.json({
      success: true,
      data: {
        courts: result.courts,
        alreadyFinalized: result.alreadyFinalized || false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments/cancel-subscription
 * Cancel a facility's subscription at end of current billing period
 */
router.post('/cancel-subscription', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.body;
    if (!facilityId) {
      return res.status(400).json({ success: false, error: 'Facility ID is required' });
    }

    const result = await cancelSubscription(facilityId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: { message: 'Subscription will be cancelled at end of billing period' } });
  } catch (error) {
    next(error);
  }
});

export default router;
