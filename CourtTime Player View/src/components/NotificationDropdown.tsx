import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bell, Calendar, MapPin, Clock, AlertCircle, Check, X, CheckCheck } from 'lucide-react';
import { useNotifications, Notification } from '../contexts/NotificationContext';

interface NotificationDropdownProps {
  children: React.ReactNode;
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'reservation_confirmed':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'reservation_cancelled':
        return <X className="h-4 w-4 text-red-600" />;
      case 'reservation_reminder':
        return <Clock className="h-4 w-4 text-green-600" />;
      case 'court_change':
        return <Calendar className="h-4 w-4 text-orange-600" />;
      case 'payment_received':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'facility_announcement':
        return <Bell className="h-4 w-4 text-purple-600" />;
      case 'weather_alert':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: Notification['priority'], read: boolean) => {
    if (read) return 'text-gray-600 bg-gray-50';
    
    switch (priority) {
      case 'high':
        return 'text-gray-900 bg-green-50 border-l-4 border-green-500';
      case 'medium':
        return 'text-gray-900 bg-orange-50 border-l-4 border-orange-500';
      case 'low':
        return 'text-gray-900 bg-gray-50';
      default:
        return 'text-gray-900 bg-gray-50';
    }
  };

  const getTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  const recentNotifications = notifications.slice(0, 8); // Show last 8 notifications

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <DropdownMenuLabel className="text-base font-medium p-0">
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs h-7 px-2"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {recentNotifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {recentNotifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`p-0 focus:bg-transparent`}
                onClick={() => !notification.read && markAsRead(notification.id)}
              >
                <div className={`w-full p-3 cursor-pointer hover:bg-gray-50 transition-colors ${getPriorityColor(notification.priority, notification.read)}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-sm font-medium truncate ${notification.read ? 'text-gray-600' : 'text-gray-900'}`}>
                          {notification.title}
                        </p>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {getTimeAgo(notification.timestamp)}
                        </span>
                      </div>
                      <p className={`text-xs line-clamp-2 ${notification.read ? 'text-gray-500' : 'text-gray-700'}`}>
                        {notification.message}
                      </p>
                      {notification.relatedReservation && (
                        <div className="mt-2 text-xs text-gray-500 bg-gray-100 rounded p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{notification.relatedReservation.facility}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{notification.relatedReservation.court} • {notification.relatedReservation.date} • {notification.relatedReservation.time}</span>
                          </div>
                        </div>
                      )}
                      {!notification.read && (
                        <div className="absolute right-2 top-3">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        {notifications.length > 8 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center text-sm text-green-600 hover:text-green-700 cursor-pointer p-3">
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}