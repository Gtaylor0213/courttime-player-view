import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { notificationsApi } from '../api/client';
import { useAuth } from './AuthContext';

export interface Notification {
  id: string;
  type: 'reservation_confirmed' | 'reservation_cancelled' | 'reservation_reminder' | 'court_change' | 'payment_received' | 'facility_announcement' | 'weather_alert';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
  relatedReservation?: {
    facility: string;
    court: string;
    date: string;
    time: string;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  showToast: (type: Notification['type'], title: string, message: string, reservation?: Notification['relatedReservation']) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications from database
  const refreshNotifications = async () => {
    if (!user?.id || loading) return;

    try {
      setLoading(true);
      const response = await notificationsApi.getNotifications(user.id);

      if (response.success && response.data?.data?.notifications) {
        const dbNotifications = response.data.data.notifications.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
        setNotifications(dbNotifications);

        // Update unread count
        const unread = dbNotifications.filter((n: Notification) => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and periodic refresh
  useEffect(() => {
    if (user?.id) {
      refreshNotifications();

      // Refresh notifications every 30 seconds
      const interval = setInterval(refreshNotifications, 30000);
      return () => clearInterval(interval);
    } else {
      // Clear notifications when user logs out
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user?.id]);

  const markAsRead = async (id: string) => {
    // Optimistically update UI
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id
          ? { ...notification, read: true }
          : notification
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    // Update in database
    try {
      await notificationsApi.markAsRead(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Refresh to get correct state
      refreshNotifications();
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    // Optimistically update UI
    setNotifications(prev =>
      prev.map(notification => ({ ...notification, read: true }))
    );
    setUnreadCount(0);

    // Update in database
    try {
      await notificationsApi.markAllAsRead(user.id);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Refresh to get correct state
      refreshNotifications();
    }
  };

  const addNotification = (notificationData: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notificationData,
      id: `notification-${Date.now()}`,
      timestamp: new Date(),
      read: false
    };

    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // If user is logged in, also save to database
    if (user?.id) {
      notificationsApi.create({
        userId: user.id,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        actionUrl: notificationData.actionUrl,
        priority: notificationData.priority
      }).catch(error => {
        console.error('Error creating notification in database:', error);
      });
    }
  };

  const removeNotification = async (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));

    // Update unread count if notification was unread
    const notification = notifications.find(n => n.id === id);
    if (notification && !notification.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    // Delete from database
    try {
      await notificationsApi.delete(id);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const showToast = (
    type: Notification['type'], 
    title: string, 
    message: string, 
    reservation?: Notification['relatedReservation']
  ) => {
    // Add to notifications list
    addNotification({
      type,
      title,
      message,
      priority: type === 'reservation_confirmed' || type === 'reservation_reminder' ? 'high' : 'medium',
      relatedReservation: reservation
    });

    // Show toast notification with appropriate styling
    switch (type) {
      case 'reservation_confirmed':
        toast.success(title, {
          description: message,
          duration: 5000,
          action: reservation ? {
            label: 'View Details',
            onClick: () => {}
          } : undefined
        });
        break;
      case 'reservation_cancelled':
        toast.error(title, {
          description: message,
          duration: 6000,
          action: {
            label: 'Book Again',
            onClick: () => {}
          }
        });
        break;
      case 'reservation_reminder':
        toast.info(title, {
          description: message,
          duration: 8000,
          action: {
            label: 'Get Directions',
            onClick: () => {}
          }
        });
        break;
      case 'court_change':
        toast.warning(title, {
          description: message,
          duration: 7000
        });
        break;
      case 'payment_received':
        toast.success(title, {
          description: message,
          duration: 4000
        });
        break;
      case 'weather_alert':
        toast.warning(title, {
          description: message,
          duration: 6000
        });
        break;
      case 'facility_announcement':
        toast.info(title, {
          description: message,
          duration: 5000
        });
        break;
      default:
        toast(title, {
          description: message,
          duration: 4000
        });
    }
  };

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    addNotification,
    removeNotification,
    showToast,
    refreshNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}