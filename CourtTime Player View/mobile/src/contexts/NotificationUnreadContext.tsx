/**
 * Unread in-app notification count for the header bell. Polls like
 * MessageUnreadContext and refreshes when the app returns to the foreground;
 * the Notifications screen calls `refresh` after marking items read.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { unwrapApiPayload } from '../../../shared/api/core';
import { useAuth } from './AuthContext';

const REFRESH_MS = 60_000;

type NotificationUnreadContextValue = {
  unreadCount: number;
  refresh: () => Promise<void>;
  /** Optimistic update from the Notifications screen. */
  setUnreadCount: (count: number) => void;
};

const NotificationUnreadContext = createContext<NotificationUnreadContextValue | null>(null);

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    const res = await api.get(`/api/notifications/${user.id}/unread-count`);
    if (!res.success) return;
    const payload = unwrapApiPayload<{ count?: number | string }>(res.data);
    const n = Number(payload?.count ?? 0);
    setUnreadCount(Number.isFinite(n) ? Math.max(0, n) : 0);
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setUnreadCount(0);
      return;
    }
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isAuthenticated, user?.id, refresh]);

  const value = useMemo(() => ({ unreadCount, refresh, setUnreadCount }), [unreadCount, refresh]);
  return <NotificationUnreadContext.Provider value={value}>{children}</NotificationUnreadContext.Provider>;
}

export function useNotificationUnread() {
  const ctx = useContext(NotificationUnreadContext);
  if (!ctx) throw new Error('useNotificationUnread must be used within a NotificationUnreadProvider');
  return ctx;
}
