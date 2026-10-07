import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const MESSAGE_UNREAD_REFRESH_MS = 30_000;

type ConversationWithUnreadCount = {
  unreadCount?: number | string | null;
};

type MessageUnreadContextValue = {
  hasUnreadMessages: boolean;
  unreadMessagesCount: number;
  refreshUnreadMessages: () => Promise<void>;
  syncUnreadState: (conversations: ConversationWithUnreadCount[]) => void;
};

const MessageUnreadContext = createContext<MessageUnreadContextValue | null>(null);

function toUnreadNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}

function totalUnreadMessages(conversations: ConversationWithUnreadCount[]): number {
  return conversations.reduce((total, conversation) => total + toUnreadNumber(conversation.unreadCount), 0);
}

export function MessageUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user, facilityId } = useAuth();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const syncUnreadState = useCallback((conversations: ConversationWithUnreadCount[]) => {
    setUnreadMessagesCount(totalUnreadMessages(conversations));
  }, []);

  const refreshUnreadMessages = useCallback(async () => {
    if (!user?.id || !facilityId) {
      setUnreadMessagesCount(0);
      return;
    }

    const res = await api.get(`/api/messages/conversations/${facilityId}/${user.id}`);
    if (!res.success || !res.data) {
      return;
    }

    const conversations = res.data.conversations || res.data.data?.conversations || [];
    syncUnreadState(conversations);
  }, [facilityId, syncUnreadState, user?.id]);

  useEffect(() => {
    if (!user?.id || !facilityId) {
      setUnreadMessagesCount(0);
      return;
    }

    void refreshUnreadMessages();

    const intervalId = setInterval(() => {
      void refreshUnreadMessages();
    }, MESSAGE_UNREAD_REFRESH_MS);

    return () => clearInterval(intervalId);
  }, [facilityId, refreshUnreadMessages, user?.id]);

  const value = useMemo(
    () => ({
      hasUnreadMessages: unreadMessagesCount > 0,
      unreadMessagesCount,
      refreshUnreadMessages,
      syncUnreadState,
    }),
    [refreshUnreadMessages, syncUnreadState, unreadMessagesCount]
  );

  return <MessageUnreadContext.Provider value={value}>{children}</MessageUnreadContext.Provider>;
}

export function useMessageUnread() {
  const context = useContext(MessageUnreadContext);
  if (!context) {
    throw new Error('useMessageUnread must be used within a MessageUnreadProvider');
  }
  return context;
}
