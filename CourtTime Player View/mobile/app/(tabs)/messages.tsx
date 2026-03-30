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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

interface ConversationItem {
  id: string;
  otherUser: { id: string; name: string; email: string };
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
  skillLevel?: string;
}

export default function MessagesScreen() {
  const { user, facilityId } = useAuth();

  // Conversation list state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active conversation state
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesListRef = useRef<FlatList>(null);

  // New message modal state
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    if (!user || !facilityId) return;

    const res = await api.get(`/api/messages/conversations/${facilityId}/${user.id}`);
    if (res.success && res.data) {
      const convos = res.data.conversations || [];
      setConversations(convos);
    }
    setLoading(false);
  }, [user, facilityId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  // ── Fetch messages for a conversation ──
  const fetchMessages = useCallback(async (conversationId: string) => {
    const res = await api.get(`/api/messages/${conversationId}`);
    if (res.success && res.data) {
      setMessages(res.data.messages || []);
    }

    // Mark as read
    if (user) {
      api.post(`/api/messages/${conversationId}/read`, { userId: user.id });
    }
  }, [user]);

  const openConversation = useCallback((convo: ConversationItem) => {
    setActiveConversation(convo);
    fetchMessages(convo.id);
  }, [fetchMessages]);

  // ── Send a message ──
  async function handleSend() {
    if (!newMessage.trim() || !user || !facilityId || sending) return;

    if (!activeConversation) return;

    setSending(true);
    const res = await api.post('/api/messages', {
      senderId: user.id,
      recipientId: activeConversation.otherUser.id,
      facilityId,
      messageText: newMessage.trim(),
    });

    if (res.success) {
      setNewMessage('');
      fetchMessages(activeConversation.id);
    }
    setSending(false);
  }

  // ── Start a new conversation ──
  async function fetchMembers() {
    if (!facilityId) return;
    setLoadingMembers(true);
    const res = await api.get(`/api/members/${facilityId}`);
    if (res.success && res.data) {
      const memberList = Array.isArray(res.data) ? res.data : res.data.members || [];
      // Exclude self
      setMembers(memberList.filter((m: MemberItem) => m.userId !== user?.id));
    }
    setLoadingMembers(false);
  }

  function openNewMessage() {
    fetchMembers();
    setMemberSearch('');
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
      otherUser: { id: member.userId, name: member.fullName, email: member.email },
      lastMessage: null,
      unreadCount: 0,
    });
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

    if (res.success && res.data) {
      setNewMessage('');
      const conversationId = res.data.conversationId;
      // Update the active conversation with the real ID
      setActiveConversation(prev => prev ? { ...prev, id: conversationId } : null);
      fetchMessages(conversationId);
      fetchConversations(); // Refresh the list
    }
    setSending(false);
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
    m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // ── RENDER: Message Thread View ──
  if (activeConversation) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Thread Header */}
        <View style={styles.threadHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setActiveConversation(null);
              setMessages([]);
              fetchConversations();
            }}
          >
            <Text style={styles.backText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={styles.threadHeaderInfo}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>
                {getInitials(activeConversation.otherUser.name)}
              </Text>
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
          onContentSizeChange={() => messagesListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadText}>
                Start the conversation with {activeConversation.otherUser.name}!
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === user?.id;
            return (
              <View style={[styles.messageBubbleRow, isMe && styles.messageBubbleRowMe]}>
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
          }}
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.messageInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={activeConversation.id ? handleSend : handleSendNewConversation}
            disabled={!newMessage.trim() || sending}
          >
            <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── RENDER: Conversation List ──
  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* New Message Button */}
      <TouchableOpacity style={styles.newMessageButton} onPress={openNewMessage}>
        <Text style={styles.newMessageButtonText}>+ New Message</Text>
      </TouchableOpacity>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={conversations.length === 0 ? styles.centered : undefined}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Tap "+ New Message" to start a conversation with a facility member.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.conversationItem} onPress={() => openConversation(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.otherUser.name)}</Text>
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
            <TouchableOpacity onPress={() => setShowNewMessage(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Message</Text>
            <View style={{ width: 60 }} />
          </View>

          <TextInput
            style={styles.searchInput}
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="Search members..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
          />

          {loadingMembers ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Loading members...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.userId}
              ListEmptyComponent={
                <View style={{ padding: Spacing.lg, alignItems: 'center' }}>
                  <Text style={styles.emptyText}>No members found</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => startConversation(item)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(item.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.fullName}</Text>
                    <Text style={styles.memberMeta}>
                      {item.skillLevel ? `${item.skillLevel} · ` : ''}{item.email}
                    </Text>
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

  // ── New Message Button ──
  newMessageButton: {
    margin: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newMessageButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // ── Conversation List ──
  conversationItem: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    alignItems: 'center',
    gap: Spacing.sm,
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
    fontWeight: '700',
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
    fontWeight: '600',
    color: Colors.text,
  },
  timestamp: {
    fontSize: FontSize.xs,
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
    fontWeight: '700',
  },

  // ── Empty State ──
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
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
    fontWeight: '600',
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
    fontWeight: '700',
  },
  threadName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  messagesList: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  emptyThread: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyThreadText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
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
    color: Colors.text,
    lineHeight: 20,
  },
  messageTextMe: {
    color: Colors.textInverse,
  },
  messageTime: {
    fontSize: 10,
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
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    maxHeight: 100,
    backgroundColor: Colors.surface,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // ── New Message Modal ──
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  searchInput: {
    margin: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  memberMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
