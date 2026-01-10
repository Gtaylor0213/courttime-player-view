import { getPool } from '../database/connection';
import { Notification } from '../contexts/NotificationContext';

export interface DBNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  action_url?: string;
  created_at: Date;
  priority?: 'low' | 'medium' | 'high';
  related_booking_id?: string;
}

export const notificationService = {
  // Get all notifications for a user
  async getNotifications(userId: string): Promise<Notification[]> {
    const query = `
      SELECT
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        action_url,
        created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `;

    try {
      const pool = getPool();
      const result = await pool.query(query, [userId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        type: this.mapDatabaseTypeToNotificationType(row.type),
        title: row.title,
        message: row.message,
        timestamp: new Date(row.created_at),
        read: row.is_read,
        actionUrl: row.action_url,
        priority: this.inferPriority(row.type)
      }));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  },

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `;

    try {
      const pool = getPool();
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
      throw error;
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    const query = `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
    `;

    try {
      const pool = getPool();
      await pool.query(query, [notificationId]);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string): Promise<void> {
    const query = `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
    `;

    try {
      const pool = getPool();
      await pool.query(query, [userId]);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },

  // Create a new notification
  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    options?: {
      actionUrl?: string;
      priority?: 'low' | 'medium' | 'high';
    }
  ): Promise<string> {
    const query = `
      INSERT INTO notifications (user_id, title, message, type, action_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    try {
      const pool = getPool();
      const result = await pool.query(query, [
        userId,
        title,
        message,
        type,
        options?.actionUrl || null
      ]);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  },

  // Delete a notification
  async deleteNotification(notificationId: string): Promise<void> {
    const query = `
      DELETE FROM notifications
      WHERE id = $1
    `;

    try {
      const pool = getPool();
      await pool.query(query, [notificationId]);
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  },

  // Helper: Map database type to frontend type
  mapDatabaseTypeToNotificationType(dbType: string): Notification['type'] {
    const typeMap: Record<string, Notification['type']> = {
      'booking_confirmed': 'reservation_confirmed',
      'booking_cancelled': 'reservation_cancelled',
      'booking_reminder': 'reservation_reminder',
      'court_change': 'court_change',
      'payment': 'payment_received',
      'announcement': 'facility_announcement',
      'weather': 'weather_alert'
    };

    return typeMap[dbType] || 'facility_announcement';
  },

  // Helper: Infer priority from type
  inferPriority(type: string): 'low' | 'medium' | 'high' {
    if (type.includes('confirmed') || type.includes('reminder')) {
      return 'high';
    }
    if (type.includes('cancelled') || type.includes('change')) {
      return 'medium';
    }
    return 'low';
  },

  // Helper: Format date
  formatDate(date: Date): string {
    const now = new Date();
    const bookingDate = new Date(date);
    const diffDays = Math.floor((bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';

    return bookingDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  },

  // Helper: Format time range
  formatTimeRange(startTime: Date, endTime: Date): string {
    const start = new Date(startTime);
    const end = new Date(endTime);

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    return `${formatTime(start)} - ${formatTime(end)}`;
  },

  // Notification creation helpers for common scenarios
  async notifyBookingConfirmed(
    userId: string,
    facilityName: string,
    courtName: string,
    startTime: Date,
    endTime: Date
  ): Promise<string> {
    const title = 'Court Reservation Confirmed';
    const message = `Your ${courtName} booking at ${facilityName} has been confirmed for ${this.formatDate(startTime)} at ${this.formatTimeRange(startTime, endTime)}.`;

    return this.createNotification(
      userId,
      title,
      message,
      'booking_confirmed',
      { priority: 'high' }
    );
  },

  async notifyBookingCancelled(
    userId: string,
    facilityName: string,
    courtName: string,
    startTime: Date,
    reason?: string
  ): Promise<string> {
    const title = 'Reservation Cancelled';
    const message = `Your ${courtName} booking at ${facilityName} for ${this.formatDate(startTime)} has been cancelled${reason ? `: ${reason}` : '.'}.`;

    return this.createNotification(
      userId,
      title,
      message,
      'booking_cancelled',
      { priority: 'medium' }
    );
  },

  async notifyBookingReminder(
    userId: string,
    facilityName: string,
    courtName: string,
    startTime: Date,
    hoursUntil: number
  ): Promise<string> {
    const title = 'Court Session Starting Soon';
    const message = `Your ${courtName} session at ${facilityName} starts in ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}.`;

    return this.createNotification(
      userId,
      title,
      message,
      'booking_reminder',
      { priority: 'high' }
    );
  },

  async notifyCourtChange(
    userId: string,
    facilityName: string,
    oldCourtName: string,
    newCourtName: string,
    startTime: Date
  ): Promise<string> {
    const title = 'Court Assignment Changed';
    const message = `Your reservation at ${facilityName} for ${this.formatDate(startTime)} has been moved from ${oldCourtName} to ${newCourtName}.`;

    return this.createNotification(
      userId,
      title,
      message,
      'court_change',
      { priority: 'medium' }
    );
  },

  async notifyPaymentReceived(
    userId: string,
    amount: number,
    facilityName: string
  ): Promise<string> {
    const title = 'Payment Processed';
    const message = `Payment of $${amount.toFixed(2)} has been processed for your court reservation at ${facilityName}.`;

    return this.createNotification(
      userId,
      title,
      message,
      'payment',
      { priority: 'low' }
    );
  },

  async notifyFacilityAnnouncement(
    userIds: string[],
    title: string,
    message: string
  ): Promise<string[]> {
    const notifications = await Promise.all(
      userIds.map(userId =>
        this.createNotification(
          userId,
          title,
          message,
          'announcement',
          { priority: 'low' }
        )
      )
    );
    return notifications;
  },

  async notifyWeatherAlert(
    userIds: string[],
    title: string,
    message: string
  ): Promise<string[]> {
    const notifications = await Promise.all(
      userIds.map(userId =>
        this.createNotification(
          userId,
          title,
          message,
          'weather',
          { priority: 'medium' }
        )
      )
    );
    return notifications;
  }
};
