/**
 * Stripe Connect onboarding routes.
 *
 * These endpoints are NEW and operate independently of the existing platform
 * subscription endpoints in routes/payments.ts and routes/webhook.ts.
 */

import express from 'express';
import { query } from '../../src/database/connection';
import { requireAuth } from '../middleware/auth';
import {
  createConnectOnboardingLink,
  isClubAdmin,
  syncConnectOnboardingStatus,
} from '../../src/services/stripeConnectService';

const router = express.Router();

function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:5173';
}

function buildReturnUrls(clubId: string) {
  const base = getAppUrl();
  return {
    returnUrl: `${base}/admin/facilities?tab=payments&connect=return&clubId=${encodeURIComponent(clubId)}`,
    refreshUrl: `${base}/admin/facilities?tab=payments&connect=refresh&clubId=${encodeURIComponent(clubId)}`,
  };
}

/**
 * GET /api/stripe/connect?clubId=<facilityId>
 * Creates an Express AccountLink and redirects the admin to Stripe.
 * Stripe-hosted onboarding will redirect back to /api/stripe/callback.
 */
router.get('/connect', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }

    const userId = req.user!.userId;
    const admin = await isClubAdmin(userId, clubId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not an admin of this club' });
    }

    const facilityResult = await query(
      'SELECT id, name, email FROM facilities WHERE id = $1',
      [clubId]
    );
    if (facilityResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Club not found' });
    }
    const facility = facilityResult.rows[0];

    const base = getAppUrl();
    const { refreshUrl } = buildReturnUrls(clubId);
    // After Stripe finishes onboarding it will hit our callback, which then
    // bounces the admin back into the Payments tab.
    const returnUrl = `${base}/api/stripe/callback?clubId=${encodeURIComponent(clubId)}`;

    const { url } = await createConnectOnboardingLink({
      clubId,
      clubName: facility.name,
      clubEmail: facility.email,
      adminEmail: req.user!.email,
      returnUrl,
      refreshUrl,
    });

    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, data: { url } });
    }
    return res.redirect(url);
  } catch (err: any) {
    console.error('[STRIPE-CONNECT] /connect failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Unable to start Stripe onboarding' });
  }
});

/**
 * GET /api/stripe/callback?clubId=<facilityId>
 * Stripe redirects the admin here after onboarding. We re-read the account
 * from Stripe, flip stripe_onboarded if charges are enabled, then bounce the
 * admin back into the admin UI.
 */
router.get('/callback', async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).send('Missing clubId');
    }

    await syncConnectOnboardingStatus(clubId);
  } catch (err: any) {
    console.error('[STRIPE-CONNECT] /callback sync failed:', err);
    // Fall through — still bounce the user into the UI so they can retry.
  }

  const base = getAppUrl();
  return res.redirect(
    `${base}/admin/facilities?tab=payments&connect=done&clubId=${encodeURIComponent(String(req.query.clubId || ''))}`
  );
});

/**
 * GET /api/stripe/connect/status?clubId=<facilityId>
 * Admin-only — returns onboarding status and refreshes it from Stripe.
 */
router.get('/connect/status', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.query.clubId || '');
    if (!clubId) {
      return res.status(400).json({ success: false, error: 'clubId is required' });
    }

    const admin = await isClubAdmin(req.user!.userId, clubId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not an admin of this club' });
    }

    const status = await syncConnectOnboardingStatus(clubId);
    const feeRow = await query(
      `SELECT platform_fee_percent FROM facilities WHERE id = $1`,
      [clubId]
    );
    return res.json({
      success: true,
      data: {
        ...status,
        platformFeePercent: Number(feeRow.rows[0]?.platform_fee_percent ?? 0),
      },
    });
  } catch (err: any) {
    console.error('[STRIPE-CONNECT] /connect/status failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to read status' });
  }
});

export default router;
