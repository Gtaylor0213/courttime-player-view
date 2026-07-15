/**
 * Member → Club Stripe Connect payment routes.
 *
 * Mounted at /api/connect-payments and exposed to the frontend under
 * /api/payments/{checkout,history,my-history}/... via routing in server/index.ts.
 *
 * NOTE: these endpoints are SEPARATE from the existing platform-subscription
 * payment endpoints in routes/payments.ts. No existing route is modified.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createMemberCheckoutSession,
  createMemberSetupCheckoutSession,
  detachMemberPaymentMethod,
  getClubPaymentHistory,
  getMemberPaymentHistory,
  getMemberSavedPaymentMethod,
  getPaymentItem,
  isClubAdmin,
  isClubMember,
  refundConnectPayment,
  syncSetupSessionForMember,
} from '../../src/services/stripeConnectService';

const router = express.Router();

function defaultAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:5173';
}

/**
 * POST /api/payments/checkout
 * Member pays for a single PaymentItem. Returns { url } to redirect to.
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { paymentItemId, successUrl, cancelUrl } = req.body || {};
    if (!paymentItemId) {
      return res.status(400).json({ success: false, error: 'paymentItemId is required' });
    }

    const item = await getPaymentItem(paymentItemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Payment item not found' });
    }
    if (!item.isActive) {
      return res.status(400).json({ success: false, error: 'This item is not currently available' });
    }

    const userId = req.user!.userId;
    const member = await isClubMember(userId, item.clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }

    const base = defaultAppUrl();
    const finalSuccessUrl =
      successUrl || `${base}/payments/success?session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${base}/payments`;

    const { url, paymentId } = await createMemberCheckoutSession({
      paymentItemId,
      memberId: userId,
      successUrl: finalSuccessUrl,
      cancelUrl: finalCancelUrl,
    });

    return res.json({ success: true, data: { url, paymentId } });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] checkout failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to create checkout session' });
  }
});

/**
 * GET /api/payments/history?clubId=<id>
 * Admin sees all payments for their club.
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }
    const admin = await isClubAdmin(req.user!.userId, clubId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not an admin of this club' });
    }
    const payments = await getClubPaymentHistory(clubId);
    return res.json({ success: true, data: payments });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] history failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to load history' });
  }
});

/**
 * GET /api/payments/payment-method?clubId=<id>
 * Saved card summary for the member at this club.
 */
router.get('/payment-method', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }
    const userId = req.user!.userId;
    const member = await isClubMember(userId, clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }
    const method = await getMemberSavedPaymentMethod(userId, clubId);
    return res.json({ success: true, data: method });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] payment-method get failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to load payment method' });
  }
});

/**
 * POST /api/payments/setup-checkout
 * Stripe Checkout (setup mode) to add or update saved card.
 */
router.post('/setup-checkout', requireAuth, async (req, res) => {
  try {
    const { clubId, successUrl, cancelUrl } = req.body || {};
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }
    const userId = req.user!.userId;
    const member = await isClubMember(userId, clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }
    const base = defaultAppUrl();
    const finalSuccessUrl =
      successUrl || `${base}/payments?setup=success&session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${base}/payments`;

    const { url } = await createMemberSetupCheckoutSession({
      userId,
      clubId,
      successUrl: finalSuccessUrl,
      cancelUrl: finalCancelUrl,
    });
    return res.json({ success: true, data: { url } });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] setup-checkout failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to start card setup' });
  }
});

/**
 * POST /api/payments/sync-setup-session
 * Called after returning from Stripe setup checkout to save the card without
 * waiting for the webhook. Idempotent — safe to call even if webhook already ran.
 */
router.post('/sync-setup-session', requireAuth, async (req, res) => {
  try {
    const { clubId, sessionId } = req.body || {};
    if (!clubId || !sessionId) {
      return res.status(400).json({ success: false, error: 'clubId and sessionId are required' });
    }
    const userId = req.user!.userId;
    const member = await isClubMember(userId, clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }
    await syncSetupSessionForMember(userId, clubId, sessionId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] sync-setup-session failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to sync payment method' });
  }
});

/**
 * DELETE /api/payments/payment-method?clubId=<id>
 * Remove saved card for this club.
 */
router.delete('/payment-method', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }
    const userId = req.user!.userId;
    const member = await isClubMember(userId, clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }
    await detachMemberPaymentMethod(userId, clubId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] payment-method delete failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to remove card' });
  }
});

/**
 * GET /api/payments/my-history?clubId=<id?>
 * Member sees their own payment history (optionally filtered by club).
 */
router.get('/my-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const clubId = req.query.clubId ? String(req.query.clubId) : null;
    const all = await getMemberPaymentHistory(userId);
    const payments = clubId ? all.filter(p => p.clubId === clubId) : all;
    return res.json({ success: true, data: payments });
  } catch (err: any) {
    console.error('[CONNECT-PAYMENTS] my-history failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to load history' });
  }
});

/**
 * POST /api/payments/:connectPaymentId/refund
 * Club admin refunds a paid member charge on their connected account.
 */
router.post('/:connectPaymentId/refund', requireAuth, async (req, res) => {
  try {
    const connectPaymentId = String(req.params.connectPaymentId || '');
    if (!connectPaymentId) {
      return res.status(400).json({ success: false, error: 'connectPaymentId is required' });
    }

    const result = await refundConnectPayment(connectPaymentId, req.user!.userId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    const message = err.message || 'Failed to refund payment';
    console.error('[CONNECT-PAYMENTS] refund failed:', err);

    if (message === 'Payment not found') {
      return res.status(404).json({ success: false, error: message });
    }
    if (message === 'Not authorized to refund this payment') {
      return res.status(403).json({ success: false, error: message });
    }
    if (
      message === 'Payment has already been refunded' ||
      message === 'Only paid card charges can be refunded'
    ) {
      return res.status(400).json({ success: false, error: message });
    }

    return res.status(400).json({ success: false, error: message });
  }
});

export default router;
