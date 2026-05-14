/**
 * Payment item CRUD — items a club admin lets members pay for
 * (ball machine time, clinics, drills, dues, etc.).
 */

import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createPaymentItem,
  getActivePaymentItemsForClub,
  getAllPaymentItemsForClub,
  getPaymentItem,
  isClubAdmin,
  isClubMember,
  updatePaymentItem,
  type PaymentCategory,
} from '../../src/services/stripeConnectService';

const router = express.Router();

const VALID_CATEGORIES: PaymentCategory[] = ['BALL_MACHINE', 'CLINIC', 'DRILL', 'DUES', 'OTHER'];
const VALID_INTERVALS = new Set(['month', 'year']);

/**
 * POST /api/payment-items
 * Admin creates a payment item for their club.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      clubId,
      name,
      description,
      amountCents,
      category,
      isRecurring,
      recurringInterval,
    } = req.body || {};

    if (!clubId || !name || amountCents == null || !category) {
      return res
        .status(400)
        .json({ success: false, error: 'clubId, name, amountCents, category are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ success: false, error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
    }
    if (isRecurring && !VALID_INTERVALS.has(recurringInterval)) {
      return res.status(400).json({
        success: false,
        error: 'recurringInterval must be "month" or "year" when isRecurring is true',
      });
    }

    const admin = await isClubAdmin(req.user!.userId, clubId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not an admin of this club' });
    }

    const item = await createPaymentItem({
      clubId,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      amountCents: Number(amountCents),
      category,
      isRecurring: Boolean(isRecurring),
      recurringInterval: isRecurring ? recurringInterval : null,
    });
    return res.status(201).json({ success: true, data: item });
  } catch (err: any) {
    console.error('[PAYMENT-ITEMS] create failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to create payment item' });
  }
});

/**
 * PUT /api/payment-items/:id
 * Admin updates or deactivates a payment item.
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await getPaymentItem(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Payment item not found' });
    }
    const admin = await isClubAdmin(req.user!.userId, existing.clubId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not an admin of this club' });
    }

    const {
      name,
      description,
      amountCents,
      category,
      isRecurring,
      recurringInterval,
      isActive,
    } = req.body || {};

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ success: false, error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
    }
    if (
      recurringInterval !== undefined &&
      recurringInterval !== null &&
      !VALID_INTERVALS.has(recurringInterval)
    ) {
      return res
        .status(400)
        .json({ success: false, error: 'recurringInterval must be "month" or "year"' });
    }

    const updated = await updatePaymentItem(id, existing.clubId, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? (description ? String(description).trim() : null) : undefined,
      amountCents: amountCents !== undefined ? Number(amountCents) : undefined,
      category: category !== undefined ? category : undefined,
      isRecurring: isRecurring !== undefined ? Boolean(isRecurring) : undefined,
      recurringInterval: recurringInterval !== undefined ? recurringInterval : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[PAYMENT-ITEMS] update failed:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to update payment item' });
  }
});

/**
 * GET /api/payment-items/club/:clubId
 *  - Members: only active items.
 *  - Admins:  all items (active + inactive) so they can manage them.
 */
router.get('/club/:clubId', requireAuth, async (req, res) => {
  try {
    const clubId = String(req.params.clubId);
    const userId = req.user!.userId;

    const admin = await isClubAdmin(userId, clubId);
    if (admin) {
      const items = await getAllPaymentItemsForClub(clubId);
      return res.json({ success: true, data: items });
    }

    const member = await isClubMember(userId, clubId);
    if (!member) {
      return res.status(403).json({ success: false, error: 'Not a member of this club' });
    }
    const items = await getActivePaymentItemsForClub(clubId);
    return res.json({ success: true, data: items });
  } catch (err: any) {
    console.error('[PAYMENT-ITEMS] list failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to list payment items' });
  }
});

export default router;
