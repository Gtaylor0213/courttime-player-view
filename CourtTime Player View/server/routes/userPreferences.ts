import express from 'express';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../src/services/userPreferencesService';

const router = express.Router();

/**
 * GET /api/user-preferences/notifications
 * Returns the authenticated user's push notification preferences.
 */
router.get('/notifications', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const prefs = await getNotificationPreferences(userId);
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/user-preferences/notifications
 * Body: any subset of NotificationPreferences keys.
 */
router.patch('/notifications', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const prefs = await updateNotificationPreferences(userId, req.body || {});
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    next(error);
  }
});

export default router;
