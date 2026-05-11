/**
 * Messages Tab
 * View conversations, read message threads, send new messages
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../../src/constants/theme';
import { ConversationSkeleton } from '../../src/components/LoadingSkeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { CachedImage } from '../../src/components/CachedImage';
import { useMessageUnread } from '../../src/contexts/MessageUnreadContext';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { useOfflineApi } from '../../src/hooks/useOfflineApi';
import { userFacingApiMessage } from '../../src/utils/apiUserMessages';

export const ErrorBoundary = createRouteErrorBoundary('Messages');

interface ConversationItem {
  id: string;
  otherUser: { id: string; name: string; email: string; profileImageUrl?: string };
  lastMessage: { text: string; senderId: string; sentAt: string } | null;
  unreadCount: number;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
}

interface MemberItem {
  userId: string;
  fullName: string;
  email: string;
  profileImageUrl?: string;
  skillLevel?: string;
  status?: 'active' | 'pending' | 'expired' | 'suspended';
}

function asRouteParam(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  if (typeof next !== 'string') return undefined;

  const trimmed = next.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function MessagesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    facilityId?: string | string[];
    conversationId?: string | string[];
  }>();
  const { user, facilityId, facilities, setFacilityId } = useAuth();
  const { syncUnreadState } = useMessageUnread();
  const { bannerState, lastCachedAt, fetchWithCache, retryConnectivity } = useOfflineApi();
  const routeFacilityId = asRouteParam(params.facilityId);
  const routeConversationId = asRouteParam(params.conversationId);

  // Conversation list state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);

  // Active conversation state
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesListRef = useRef<FlatList<MessageItem>>(null);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);

  // New message modal state
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null);

  const clearDeepLinkParams = useCallback(() => {
    router.setParams({
      facilityId: undefined,
      conversationId: undefined,
    });
  }, [router]);

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    if (!user || !facilityId) {
      setConversations([]);
      setConversationLoadError(null);
      setLoading(false);
      return;
    }

    const res = await fetchWithCache<{ conversations?: ConversationItem[]; data?: { conversations?: ConversationItem[] } }>(
      `message_conversations_${facilityId}_${user.id}`,
      `/api/messages/conversations/${facilityId}/${user.id}`
    );
    if (res.data) {
      // Server wraps as { success, data: { conversations } }, so unwrap one level
      const convos = res.data.conversations || res.data.data?.conversations || [];
      const normalized = convos.map((convo: any) => ({
        ...convo,
        otherUser: {
          ...convo.otherUser,
          profileImageUrl: convo.otherUser?.profileImageUrl || convo.otherUser?.profile_image_url,
        },
      }));
      setConversations(normalized);
      syncUnreadState(normalized);
      setConversationLoadError(null);
    } else {
      setConversations([]);
      setConversationLoadError(
        userFacingApiMessage({
          success: false,
          error: res.error,
          errorCategory: res.errorCategory,
        })
      );
    }
    setLoading(false);
  }, [user, facilityId, fetchWithCache, syncUnreadState]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!routeFacilityId || facilityId === routeFacilityId) return;
    if (!facilities.some(facility => facility.id === routeFacilityId)) return;
    setFacilityId(routeFacilityId);
  }, [routeFacilityId, facilityId, facilities, setFacilityId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  // ── Fetch messages for a conversation ──
  const fetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetchWithCache<{ messages?: MessageItem[]; data?: { messages?: MessageItem[] } }>(
      `messages_${conversationId}`,
      `/api/messages/${conversationId}`
    );
    if (res.data) {
      const msgs = res.data.messages || res.data.data?.messages || [];
      setMessages(msgs);
      setThreadLoadError(null);
    } else {
      setMessages([]);
      setThreadLoadError(
        userFacingApiMessage({
          success: false,
          error: res.error,
          errorCategory: res.errorCategory,
        })
      );
    }

    // Mark as read
    if (user) {
      setConversations(prev => {
        const next = prev.map(convo =>
          convo.id === conversationId ? { ...convo, unreadCount: 0 } : convo
        );
        syncUnreadState(next);
        return next;
      });
      api.patch(`/api/messages/${conversationId}/read`, { userId: user.id });
    }
  }, [fetchWithCache, syncUnreadState, user]);

  const openConversation = useCallback((convo: ConversationItem) => {
    setActiveConversation(convo);
    setThreadLoadError(null);
    fetchMessages(convo.id);
  }, [fetchMessages]);

  useEffect(() => {
    if (!routeConversationId) return;
    if (routeFacilityId && routeFacilityId !== facilityId) return;

    const targetConversation = conversations.find(convo => convo.id === routeConversationId);
    if (!targetConversation) {
      if (!loading) {
        clearDeepLinkParams();
      }
      return;
    }

    if (activeConversation?.id !== routeConversationId) {
      openConversation(targetConversation);
    }

    clearDeepLinkParams();
  }, [
    routeConversationId,
    routeFacilityId,
    facilityId,
    conversations,
    loading,
    activeConversation?.id,
    openConversation,
    clearDeepLinkParams,
  ]);

  // ── Send a message ──
  async function handleSend() {
    if (!newMessage.trim() || !user || !facilityId || sending) return;

    if (!activeConversation) return;

    setSending(true);
    const text = newMessage.trim();
    const res = await api.post('/api/messages', {
      senderId: user.id,
      recipientId: activeConversation.otherUser.id,
      facilityId,
      messageText: text,
    });
    setSending(false);

    const newMsg = res.data?.message || res.data?.data?.message;
    if (res.success && newMsg) {
      setNewMessage('');
      setMessages(prev => [...prev, newMsg]);
    } else {
      showApiErrorAlert(res, 'Could not send');
    }
  }

  // ── Start a new conversation ──
  async function fetchMembers() {
    if (!facilityId) return;
    setLoadingMembers(true);
    setMemberLoadError(null);
    const res = await api.get(`/api/members/${facilityId}`);
    if (res.success && res.data) {
      const memberList = Array.isArray(res.data) ? res.data : res.data.members || [];
      // Only active members can receive messages (server enforces this too).
      const normalized = memberList.map((member: any) => ({
        ...member,
        profileImageUrl: member.profileImageUrl || member.profile_image_url,
      }));
      setMembers(normalized.filter((m: MemberItem) => m.userId !== user?.id && (!m.status || m.status === 'active')));
    } else {
      setMembers([]);
      setMemberLoadError(userFacingApiMessage(res));
    }
    setLoadingMembers(false);
  }

  function openNewMessage() {
    fetchMembers();
    setMemberSearch('');
    setMemberLoadError(null);
    setShowNewMessage(true);
  }

  async function startConversation(member: MemberItem) {
    if (!user || !facilityId) return;

    setShowNewMessage(false);

    // Check if conversation already exists
    const existing = conversations.find(c => c.otherUser.id === member.userId);
    if (existing) {
      openConversation(existing);
      return;
    }

    // Create a placeholder conversation and open it
    // The real conversation will be created when the first message is sent
    setActiveConversation({
      id: '', // Will be set after first message
      otherUser: {
        id: member.userId,
        name: member.fullName,
        email: member.email,
        profileImageUrl: member.profileImageUrl,
      },
      lastMessage: null,
      unreadCount: 0,
    });
    setThreadLoadError(null);
    setMessages([]);
  }

  // Handle sending the first message in a new conversation
  async function handleSendNewConversation() {
    if (!newMessage.trim() || !user || !facilityId || sending || !activeConversation) return;

    setSending(true);
    const res = await api.post('/api/messages', {
      senderId: user.id,
      recipientId: activeConversation.otherUser.id,
      facilityId,
      messageText: newMessage.trim(),
    });
    setSending(false);

    const payload = res.data?.data || res.data;
    if (res.success && payload?.conversationId) {
      setNewMessage('');
      setActiveConversation(prev => prev ? { ...prev, id: payload.conversationId } : null);
      if (payload.message) {
        setMessages([payload.message]);
      }
      fetchConversations(); // Refresh the list so this convo shows up
    } else {
      showApiErrorAlert(res, 'Could not send');
    }
  }

  // ── Helpers ──
  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredMembers = members.filter(m =>
    m.fullName.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const renderMessageItem = useCallback(({ item }: { item: MessageItem }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View
        style={[styles.messageBubbleRow, isMe && styles.messageBubbleRowMe]}
        accessible
        accessibilityLabel={`${isMe ? 'You' : activeConversation?.otherUser.name || 'Member'} said ${item.messageText}. ${formatDate(item.createdAt)}.`}
      >
        <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
            {item.messageText}
          </Text>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }, [activeConversation?.otherUser.name, user?.id]);

  // ── RENDER: Message Thread View ──
  if (activeConversation) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
        {/* Thread Header */}
        <View style={styles.threadHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              clearDeepLinkParams();
              setActiveConversation(null);
              setMessages([]);
              fetchConversations();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
          >
            <Text style={styles.backText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={styles.threadHeaderInfo}>
            <View style={styles.avatarSmall}>
              {activeConversation.otherUser.profileImageUrl ? (
                <CachedImage uri={activeConversation.otherUser.profileImageUrl} style={styles.avatarImageSmall} />
              ) : (
                <Text style={styles.avatarSmallText}>
                  {getInitials(activeConversation.otherUser.name)}
                </Text>
              )}
            </View>
            <Text style={styles.threadName}>{activeConversation.otherUser.name}</Text>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={messagesListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => messagesListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <EmptyState
              icon={threadLoadError ? 'alert-circle-outline' : 'chatbubble-ellipses-outline'}
              title={threadLoadError ? 'Could not load messages' : 'No messages yet'}
              description={
                threadLoadError
                  ? threadLoadError
                  : `Start the conversation with ${activeConversation.otherUser.name}.`
              }
              actionLabel={threadLoadError ? 'Try again' : undefined}
              onAction={threadLoadError ? () => void fetchMessages(activeConversation.id) : undefined}
            />
          }
          renderItem={renderMessageItem}
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <Input
            style={styles.messageInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            accessibilityLabel="Message input"
            multiline
            maxLength={1000}
          />
          <Button
            title="Send"
            onPress={activeConversation.id ? handleSend : handleSendNewConversation}
            disabled={!newMessage.trim() || sending}
            loading={sending}
            accessibilityLabel="Send message"
            style={styles.sendButton}
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── RENDER: Conversation List ──
  if (loading) {
    return (
      <View style={styles.container}>
        <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
        <ConversationSkeleton />
      </View>
    );
  }

  if (!facilityId) {
    return (
      <View style={styles.container}>
        <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
        <EmptyState
          icon="mail-open-outline"
          title="Choose a club to view messages"
          description="Select one of your clubs from the header to see facility conversations and member messages."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
      {/* New Message Button */}
      <View style={styles.newMessageButtonWrap}>
        <Button title="+ New Message" onPress={openNewMessage} accessibilityLabel="Start a new message" />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={conversations.length === 0 ? styles.centered : undefined}
        ListEmptyComponent={
          <EmptyState
            icon={conversationLoadError ? 'alert-circle-outline' : 'mail-open-outline'}
            title={conversationLoadError ? 'Could not load conversations' : 'No messages yet'}
            description={
              conversationLoadError
                ? conversationLoadError
                : 'Tap "+ New Message" to start a conversation with a facility member.'
            }
            actionLabel={conversationLoadError ? 'Try again' : 'Start a conversation'}
            onAction={conversationLoadError ? () => void fetchConversations() : openNewMessage}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => openConversation(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.otherUser.name}. ${item.unreadCount > 0 ? `${item.unreadCount} unread message${item.unreadCount === 1 ? '' : 's'}.` : 'No unread messages.'} ${item.lastMessage?.text ? `Last message: ${item.lastMessage.text}.` : 'No messages yet.'}`}
          >
            <View style={styles.avatar}>
              {item.otherUser.profileImageUrl ? (
                <CachedImage uri={item.otherUser.profileImageUrl} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(item.otherUser.name)}</Text>
              )}
            </View>
            <View style={styles.conversationContent}>
              <View style={styles.conversationHeader}>
                <Text style={styles.userName}>{item.otherUser.name}</Text>
                {item.lastMessage && (
                  <Text style={styles.timestamp}>{formatDate(item.lastMessage.sentAt)}</Text>
                )}
              </View>
              <View style={styles.conversationPreview}>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessage?.text || 'No messages yet'}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* New Message Modal */}
      <Modal visible={showNewMessage} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowNewMessage(false)}
              accessibilityRole="button"
              accessibilityLabel="Close new message"
            >
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Message</Text>
            <View style={{ width: 60 }} />
          </View>

          <Input
            style={styles.searchInput}
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="Search members..."
            accessibilityLabel="Search members"
            autoFocus
          />

          {loadingMembers ? (
            <View style={{ paddingTop: Spacing.sm }}>
              <ConversationSkeleton count={5} />
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.userId}
              ListEmptyComponent={
                <EmptyState
                  icon={memberLoadError ? 'alert-circle-outline' : 'people-outline'}
                  title={memberLoadError ? 'Could not load members' : 'No members found'}
                  description={
                    memberLoadError
                      ? memberLoadError
                      : 'Try a different search or check back when more players join your facility.'
                  }
                  actionLabel={memberLoadError ? 'Try again' : undefined}
                  onAction={memberLoadError ? () => void fetchMembers() : undefined}
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => startConversation(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start a conversation with ${item.fullName}${item.skillLevel ? `. Skill level ${item.skillLevel}.` : '.'}`}
                >
                  <View style={styles.avatar}>
                    {item.profileImageUrl ? (
                      <CachedImage uri={item.profileImageUrl} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarText}>{getInitials(item.fullName)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.fullName}</Text>
                    {item.skillLevel && (
                      <Text style={styles.memberMeta}>{item.skillLevel}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  newMessageButtonWrap: {
    margin: Spacing.md,
  },

  // ── Conversation List ──
  conversationItem: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  timestamp: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  conversationPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  lastMessage: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontFamily: FontFamily.bold,
  },

  // ── Thread View ──
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
    gap: Spacing.sm,
  },
  backButton: {
    paddingRight: Spacing.sm,
  },
  backText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
  },
  threadHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  avatarImageSmall: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  threadName: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  messagesList: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  messageBubbleRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    justifyContent: 'flex-start',
  },
  messageBubbleRowMe: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  bubbleThem: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    lineHeight: 20,
  },
  messageTextMe: {
    color: Colors.textInverse,
  },
  messageTime: {
    fontSize: 10,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeMe: {
    color: Colors.textInverse + 'aa',
  },

  // ── Input Bar ──
  inputBar: {
    flexDirection: 'row',
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  messageInput: {
    flex: 1,
    maxHeight: 100,
    alignSelf: 'stretch',
  },
  sendButton: {
    alignSelf: 'flex-end',
    minWidth: 88,
  },

  // ── New Message Modal ──
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  searchInput: {
    margin: Spacing.md,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
    minHeight: TouchTarget.min,
  },
  memberMeta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
