import express from 'express';
import { notificationService } from '../../src/services/notificationService';
import { query } from '../../src/database/connection';

const router = express.Router();

function requireCurrentUser(req: express.Request, res: express.Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }
  return userId;
}

function requireSelf(req: express.Request, res: express.Response, requestedUserId: string): string | null {
  const userId = requireCurrentUser(req, res);
  if (!userId) return null;
  if (userId !== requestedUserId) {
    res.status(403).json({ success: false, error: 'Cannot access another user notifications' });
    return null;
  }
  return userId;
}

// Register a push notification token for the current user
router.post('/register-device', async (req, res) => {
  try {
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    const { pushToken, platform } = req.body;
    if (!pushToken) {
      return res.status(400).json({ success: false, error: 'pushToken is required' });
    }

    await query(
      `INSERT INTO user_push_tokens (user_id, push_token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, push_token) DO UPDATE SET platform = $3, created_at = CURRENT_TIMESTAMP`,
      [userId, pushToken, platform || 'unknown']
    );

    res.json({ success: true, message: 'Device registered' });
  } catch (error: any) {
    console.error('Error registering push token:', error);
    res.status(500).json({ success: false, error: 'Failed to register device' });
  }
});

// Unregister a push notification token (on logout)
router.post('/unregister-device', async (req, res) => {
  try {
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    const { pushToken } = req.body;

    if (pushToken) {
      await query(`DELETE FROM user_push_tokens WHERE user_id = $1 AND push_token = $2`, [userId, pushToken]);
    } else {
      await query(`DELETE FROM user_push_tokens WHERE user_id = $1`, [userId]);
    }

    res.json({ success: true, message: 'Device unregistered' });
  } catch (error: any) {
    console.error('Error unregistering push token:', error);
    res.status(500).json({ success: false, error: 'Failed to unregister device' });
  }
});

// Get all notifications for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!requireSelf(req, res, userId)) return;
    const notifications = await notificationService.getNotifications(userId);

    res.json({
      success: true,
      data: { notifications }
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch notifications'
    });
  }
});

// Get unread count for a user
router.get('/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!requireSelf(req, res, userId)) return;
    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch unread count'
    });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark notification as read'
    });
  }
});

// Mark all notifications as read for a user
router.patch('/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!requireSelf(req, res, userId)) return;
    await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark all notifications as read'
    });
  }
});

// Create a notification (for testing or admin use)
router.post('/', async (req, res) => {
  try {
    const { userId, title, message, type, actionUrl, priority } = req.body;
    const currentUserId = requireCurrentUser(req, res);
    if (!currentUserId) return;

    if (userId && userId !== currentUserId) {
      return res.status(403).json({ success: false, error: 'Cannot create notifications for another user' });
    }

    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, message, type'
      });
    }

    const notificationId = await notificationService.createNotification(
      currentUserId,
      title,
      message,
      type,
      { actionUrl, priority }
    );

    res.json({
      success: true,
      data: { notificationId },
      message: 'Notification created successfully'
    });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create notification'
    });
  }
});

// Delete a notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = requireCurrentUser(req, res);
    if (!userId) return;
    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete notification'
    });
  }
});

export default router;
