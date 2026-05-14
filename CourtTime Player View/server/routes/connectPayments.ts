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
  getClubPaymentHistory,
  getMemberPaymentHistory,
  getPaymentItem,
  isClubAdmin,
  isClubMember,
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

export default router;
