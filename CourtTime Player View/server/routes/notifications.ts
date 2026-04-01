import express from 'express';
import { notificationService } from '../../src/services/notificationService';
import { query } from '../../src/database/connection';

const router = express.Router();

// Register a push notification token for the current user
router.post('/register-device', async (req, res) => {
  try {
    const { userId, pushToken, platform } = req.body;
    if (!userId || !pushToken) {
      return res.status(400).json({ success: false, error: 'userId and pushToken are required' });
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
    const { userId, pushToken } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

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
    await notificationService.markAsRead(notificationId);

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

    if (!userId || !title || !message || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, title, message, type'
      });
    }

    const notificationId = await notificationService.createNotification(
      userId,
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
    await notificationService.deleteNotification(notificationId);

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
