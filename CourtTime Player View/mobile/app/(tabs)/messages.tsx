/**
 * Messages Tab
 * View conversations, read message threads, send new messages
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import {
  buildSendBody,
  conversationTitle,
  isGroupManager as computeIsGroupManager,
  normalizeConversations,
  type ConversationItem,
} from '../../src/utils/messagesThread';

export const ErrorBoundary = createRouteErrorBoundary('Messages');

/** Row from GET /api/messages/groups/:id/members. */
interface GroupMember {
  userId: string;
  fullName: string;
  isFacilityAdmin: boolean;
  isCreator: boolean;
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
  profileImageUrl?: string;
  skillLevel?: string;
  isFacilityAdmin?: boolean;
}

/** Modes the member picker runs in; see the `pickerMode` state below. */
type PickerMode = 'direct' | 'several' | 'group' | 'add';

/** One "send individually" batch is capped at 30 recipients (server: BULK_RECIPIENT_LIMIT). */
const BULK_RECIPIENT_LIMIT = 30;

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
    recipientId?: string | string[];
  }>();
  const { user, facilityId, facilities, setFacilityId } = useAuth();
  const { syncUnreadState } = useMessageUnread();
  const { bannerState, lastCachedAt, fetchWithCache, retryConnectivity } = useOfflineApi();
  const routeFacilityId = asRouteParam(params.facilityId);
  const routeConversationId = asRouteParam(params.conversationId);
  const routeRecipientId = asRouteParam(params.recipientId);

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
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const messagesListRef = useRef<FlatList<MessageItem>>(null);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);

  // New message modal state. "direct" picks one member; "several" picks many and
  // sends each their own private copy; "group" names a shared group and picks
  // several (web's Create Group dialog). "add" reuses the same picker to add
  // members to the open group.
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('direct');
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null);
  // Guards against a slower earlier search overwriting a newer one.
  const memberRequestId = useRef(0);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [savingGroup, setSavingGroup] = useState(false);
  // "Several" mode composes its message inside the picker, not in a thread.
  const [bulkMessage, setBulkMessage] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);

  // Group thread state: members (for sender names and the info sheet).
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isGroupManager = computeIsGroupManager(
    activeConversation,
    user?.id,
    user?.adminFacilities,
    facilityId
  );
  const memberNameById = useMemo(
    () => new Map(groupMembers.map((m) => [m.userId, m.fullName])),
    [groupMembers]
  );

  const clearDeepLinkParams = useCallback(() => {
    router.setParams({
      facilityId: undefined,
      conversationId: undefined,
      recipientId: undefined,
      recipientName: undefined,
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
      // Rows come in two shapes (direct vs group); normalise both.
      const normalized = normalizeConversations(convos as unknown[]);
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

  const fetchGroupMembers = useCallback(async (conversationId: string) => {
    const res = await api.get(`/api/messages/groups/${conversationId}/members`);
    const payload = res.data?.data || res.data;
    setGroupMembers(res.success && Array.isArray(payload?.members) ? payload.members : []);
  }, []);

  const openConversation = useCallback((convo: ConversationItem) => {
    setActiveConversation(convo);
    setThreadLoadError(null);
    setGroupMembers([]);
    fetchMessages(convo.id);
    if (convo.isGroup) void fetchGroupMembers(convo.id);
  }, [fetchMessages, fetchGroupMembers]);

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
      ...buildSendBody(activeConversation, facilityId, text),
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

  const performDeleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    setDeletingMessageId(messageId);
    const res = await api.delete(`/api/messages/message/${messageId}`, { userId: user.id });
    setDeletingMessageId(null);
    if (res.success) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      fetchConversations();
    } else {
      showApiErrorAlert(res, 'Could not delete');
    }
  }, [user, fetchConversations]);

  const confirmDeleteMessage = useCallback((item: MessageItem) => {
    Alert.alert(
      'Delete message',
      'Remove this message from the conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void performDeleteMessage(item.id) },
      ]
    );
  }, [performDeleteMessage]);

  // ── Start a new conversation ──
  // The directory lists only members the caller is allowed to message, so this
  // works for players and admins alike.
  const fetchMembers = useCallback(async (search: string) => {
    if (!facilityId) return;

    const requestId = ++memberRequestId.current;
    setLoadingMembers(true);
    setMemberLoadError(null);

    const trimmed = search.trim();
    const res = await api.get(
      `/api/messages/directory/${facilityId}${trimmed ? `?search=${encodeURIComponent(trimmed)}` : ''}`
    );
    if (requestId !== memberRequestId.current) return;

    if (res.success) {
      setMembers(res.data?.data?.members || res.data?.members || []);
    } else {
      setMembers([]);
      setMemberLoadError(userFacingApiMessage(res));
    }
    setLoadingMembers(false);
  }, [facilityId]);

  // Load the directory when the modal opens, then debounce while the user types
  useEffect(() => {
    if (!showNewMessage) return;

    const timer = setTimeout(() => {
      void fetchMembers(memberSearch);
    }, memberSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [showNewMessage, memberSearch, fetchMembers]);

  function openNewMessage(mode: PickerMode = 'direct') {
    setPickerMode(mode);
    setMemberSearch('');
    setMembers([]);
    setMemberLoadError(null);
    setLoadingMembers(true);
    setGroupName('');
    setBulkMessage('');
    setSelectedMemberIds(new Set());
    setShowNewMessage(true);
  }

  const toggleSelectedMember = (userId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (pickerMode === 'several' && next.size >= BULK_RECIPIENT_LIMIT) {
        Alert.alert('Too many recipients', `You can message at most ${BULK_RECIPIENT_LIMIT} people at once.`);
        return prev;
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  /**
   * Sends one message to each selected member as a separate 1:1 thread, so no
   * recipient sees who else got it. Unlike a group, nothing shared is created.
   */
  async function handleSendToSeveral() {
    if (!facilityId || selectedMemberIds.size === 0 || !bulkMessage.trim() || sendingBulk) return;

    setSendingBulk(true);
    const res = await api.post('/api/messages/bulk', {
      facilityId,
      recipientIds: Array.from(selectedMemberIds),
      messageText: bulkMessage.trim(),
    });
    setSendingBulk(false);

    if (!res.success) {
      showApiErrorAlert(res, 'Could not send');
      return;
    }

    const payload = res.data?.data || res.data;
    const sentCount = payload?.sentCount ?? selectedMemberIds.size;
    const failedCount = payload?.failedCount ?? 0;

    setShowNewMessage(false);
    setBulkMessage('');
    setSelectedMemberIds(new Set());
    await fetchConversations();

    if (failedCount > 0) {
      Alert.alert('Partly sent', `Sent to ${sentCount} of ${sentCount + failedCount} people.`);
    }
  }

  // ── Groups ──
  async function handleCreateGroup() {
    if (!facilityId || !groupName.trim() || selectedMemberIds.size === 0 || savingGroup) return;
    setSavingGroup(true);
    const res = await api.post('/api/messages/groups', {
      facilityId,
      name: groupName.trim(),
      memberIds: Array.from(selectedMemberIds),
    });
    setSavingGroup(false);
    const payload = res.data?.data || res.data;
    if (res.success && payload?.conversationId) {
      setShowNewMessage(false);
      await fetchConversations();
      openConversation({
        id: payload.conversationId,
        isGroup: true,
        groupName: payload.name || groupName.trim(),
        createdBy: user?.id,
        memberCount: selectedMemberIds.size + 1,
        lastMessage: null,
        unreadCount: 0,
      });
    } else {
      showApiErrorAlert(res, 'Could not create group');
    }
  }

  async function handleAddGroupMembers() {
    if (!activeConversation?.isGroup || selectedMemberIds.size === 0 || savingGroup) return;
    setSavingGroup(true);
    const res = await api.post(`/api/messages/groups/${activeConversation.id}/members`, {
      userIds: Array.from(selectedMemberIds),
    });
    setSavingGroup(false);
    if (res.success) {
      setShowNewMessage(false);
      await fetchGroupMembers(activeConversation.id);
      setActiveConversation((prev) =>
        prev ? { ...prev, memberCount: (prev.memberCount ?? 0) + selectedMemberIds.size } : prev
      );
      fetchConversations();
    } else {
      showApiErrorAlert(res, 'Could not add members');
    }
  }

  async function handleRenameGroup() {
    if (!activeConversation?.isGroup) return;
    const name = renameValue.trim();
    if (!name || name === activeConversation.groupName || savingGroup) return;
    setSavingGroup(true);
    const res = await api.patch(`/api/messages/groups/${activeConversation.id}`, { name });
    setSavingGroup(false);
    if (res.success) {
      setActiveConversation((prev) => (prev ? { ...prev, groupName: name } : prev));
      fetchConversations();
    } else {
      showApiErrorAlert(res, 'Could not rename group');
    }
  }

  const removeGroupMember = useCallback(
    async (member: GroupMember) => {
      if (!activeConversation?.isGroup) return;
      const res = await api.delete(`/api/messages/groups/${activeConversation.id}/members/${member.userId}`);
      if (res.success) {
        setGroupMembers((prev) => prev.filter((m) => m.userId !== member.userId));
        setActiveConversation((prev) =>
          prev ? { ...prev, memberCount: Math.max(0, (prev.memberCount ?? 1) - 1) } : prev
        );
        fetchConversations();
      } else {
        showApiErrorAlert(res, 'Could not remove member');
      }
    },
    [activeConversation, fetchConversations]
  );

  const confirmRemoveGroupMember = (member: GroupMember) => {
    Alert.alert('Remove member', `Remove ${member.fullName} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeGroupMember(member) },
    ]);
  };

  const leaveThread = () => {
    setShowGroupInfo(false);
    clearDeepLinkParams();
    setActiveConversation(null);
    setMessages([]);
    setGroupMembers([]);
    fetchConversations();
  };

  const confirmLeaveGroup = () => {
    if (!activeConversation?.isGroup || !user) return;
    const conversationId = activeConversation.id;
    Alert.alert('Leave group', `Leave "${conversationTitle(activeConversation)}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await api.delete(`/api/messages/groups/${conversationId}/members/${user.id}`);
            if (res.success) leaveThread();
            else showApiErrorAlert(res, 'Could not leave group');
          })();
        },
      },
    ]);
  };

  const confirmDeleteGroup = () => {
    if (!activeConversation?.isGroup) return;
    const conversationId = activeConversation.id;
    Alert.alert(
      'Delete group',
      `Delete "${conversationTitle(activeConversation)}" for everyone? Its messages will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const res = await api.delete(`/api/messages/groups/${conversationId}`);
              if (res.success) leaveThread();
              else showApiErrorAlert(res, 'Could not delete group');
            })();
          },
        },
      ]
    );
  };

  // A draft thread has no id yet — the conversation row is created on first send.
  const openDraftConversation = useCallback((member: MemberItem) => {
    setActiveConversation({
      id: '',
      isGroup: false,
      otherUser: {
        id: member.userId,
        name: member.fullName,
        profileImageUrl: member.profileImageUrl,
      },
      lastMessage: null,
      unreadCount: 0,
    });
    setThreadLoadError(null);
    setMessages([]);
  }, []);

  function startConversation(member: MemberItem) {
    if (!user || !facilityId) return;

    setShowNewMessage(false);

    const existing = conversations.find(c => !c.isGroup && c.otherUser?.id === member.userId);
    if (existing) {
      openConversation(existing);
      return;
    }

    openDraftConversation(member);
  }

  // Opened from elsewhere in the app (e.g. "Message" on a hitting partner post),
  // where we only know who to message, not whether a thread exists yet.
  const openRecipientThread = useCallback(async (recipientId: string) => {
    if (!facilityId) return;

    const res = await api.get(`/api/messages/directory/${facilityId}/${recipientId}`);
    const member = res.data?.data?.member || res.data?.member;
    if (!res.success || !member) {
      showApiErrorAlert(res, 'Could not open conversation');
      return;
    }

    openDraftConversation(member);
  }, [facilityId, openDraftConversation]);

  useEffect(() => {
    if (!routeRecipientId || !facilityId || loading) return;
    if (routeFacilityId && routeFacilityId !== facilityId) return;

    const existing = conversations.find(convo => !convo.isGroup && convo.otherUser?.id === routeRecipientId);
    if (existing) {
      if (activeConversation?.id !== existing.id) {
        openConversation(existing);
      }
    } else if (activeConversation?.otherUser?.id !== routeRecipientId) {
      void openRecipientThread(routeRecipientId);
    }

    clearDeepLinkParams();
  }, [
    routeRecipientId,
    routeFacilityId,
    facilityId,
    loading,
    conversations,
    activeConversation?.id,
    activeConversation?.otherUser?.id,
    openConversation,
    openRecipientThread,
    clearDeepLinkParams,
  ]);

  // Handle sending the first message in a new conversation
  async function handleSendNewConversation() {
    if (!newMessage.trim() || !user || !facilityId || sending || !activeConversation) return;

    setSending(true);
    const res = await api.post('/api/messages', {
      senderId: user.id,
      ...buildSendBody(activeConversation, facilityId, newMessage.trim()),
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
  const getInitials = (name?: string) =>
    (name || '').trim().split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

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

  const renderMessageItem = useCallback(({ item }: { item: MessageItem }) => {
    const isMe = item.senderId === user?.id;
    const busy = deletingMessageId === item.id;
    // In a group, label who sent each incoming bubble (web does the same).
    const senderName = isMe
      ? 'You'
      : activeConversation?.isGroup
        ? memberNameById.get(item.senderId) || 'Member'
        : activeConversation?.otherUser?.name || 'Member';
    const showSenderName = !isMe && !!activeConversation?.isGroup;
    return (
      <View
        style={[styles.messageBubbleRow, isMe && styles.messageBubbleRowMe]}
        accessible
        accessibilityLabel={`${senderName} said ${item.messageText}. ${formatDate(item.createdAt)}.`}
      >
        {isMe && (
          <TouchableOpacity
            style={styles.deleteMessageBtn}
            onPress={() => confirmDeleteMessage(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Delete message"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={Colors.textMuted} />
            ) : (
              <Text style={styles.deleteMessageBtnText}>Delete</Text>
            )}
          </TouchableOpacity>
        )}
        <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {showSenderName ? <Text style={styles.senderName}>{senderName}</Text> : null}
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
            {item.messageText}
          </Text>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }, [activeConversation?.otherUser?.name, activeConversation?.isGroup, memberNameById, confirmDeleteMessage, deletingMessageId, user?.id]);

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
            onPress={leaveThread}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
          >
            <Text style={styles.backText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <View style={styles.threadHeaderInfo}>
            <View style={[styles.avatarSmall, activeConversation.isGroup && styles.avatarGroup]}>
              {activeConversation.isGroup ? (
                <Ionicons name="people" size={18} color={Colors.textInverse} />
              ) : activeConversation.otherUser?.profileImageUrl ? (
                <CachedImage uri={activeConversation.otherUser.profileImageUrl} style={styles.avatarImageSmall} />
              ) : (
                <Text style={styles.avatarSmallText}>
                  {getInitials(activeConversation.otherUser?.name) || '?'}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.threadName} numberOfLines={1}>
                {conversationTitle(activeConversation)}
              </Text>
              {activeConversation.isGroup ? (
                <Text style={styles.threadMeta}>
                  {activeConversation.memberCount ? `${activeConversation.memberCount} members` : 'Group'}
                </Text>
              ) : null}
            </View>
          </View>
          {activeConversation.isGroup ? (
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => {
                setRenameValue(activeConversation.groupName || '');
                setShowGroupInfo(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Group info"
            >
              <Ionicons name="information-circle-outline" size={24} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Messages */}
        <FlatList
          ref={messagesListRef}
          data={messages}
          extraData={deletingMessageId}
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
                  : activeConversation.isGroup
                    ? 'Say hello to the group.'
                    : `Start the conversation with ${activeConversation.otherUser?.name || 'this member'}.`
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

        {/* Group info: members, rename, add/remove, leave, delete (web's "Manage this group") */}
        <Modal
          visible={showGroupInfo}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowGroupInfo(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowGroupInfo(false)}
                accessibilityRole="button"
                accessibilityLabel="Close group info"
              >
                <Text style={styles.modalCancel}>Done</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Group info</Text>
              <View style={{ width: 60 }} />
            </View>

            {isGroupManager ? (
              <View style={styles.groupSection}>
                <Text style={styles.groupSectionLabel}>Group name</Text>
                <View style={styles.renameRow}>
                  <Input
                    style={styles.renameInput}
                    value={renameValue}
                    onChangeText={setRenameValue}
                    placeholder="Group name"
                    accessibilityLabel="Group name"
                    maxLength={80}
                    onSubmitEditing={() => void handleRenameGroup()}
                    returnKeyType="done"
                  />
                  <Button
                    title="Rename"
                    onPress={() => void handleRenameGroup()}
                    disabled={
                      savingGroup || !renameValue.trim() || renameValue.trim() === activeConversation.groupName
                    }
                    loading={savingGroup}
                    accessibilityLabel="Rename group"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.groupSection}>
              <View style={styles.groupSectionHeader}>
                <Text style={styles.groupSectionLabel}>
                  {groupMembers.length} member{groupMembers.length === 1 ? '' : 's'}
                </Text>
                {isGroupManager ? (
                  <TouchableOpacity
                    onPress={() => openNewMessage('add')}
                    accessibilityRole="button"
                    accessibilityLabel="Add members"
                  >
                    <Text style={styles.linkText}>+ Add members</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <FlatList
              data={groupMembers}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <View style={styles.memberItem}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(item.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>
                      {item.fullName}
                      {item.userId === user?.id ? ' (you)' : ''}
                    </Text>
                    <Text style={styles.memberMeta}>
                      {item.isCreator ? 'Creator' : item.isFacilityAdmin ? 'Admin' : 'Member'}
                    </Text>
                  </View>
                  {isGroupManager && !item.isCreator && item.userId !== user?.id ? (
                    <TouchableOpacity
                      onPress={() => confirmRemoveGroupMember(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.fullName}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="person-remove-outline" size={20} color={Colors.destructive} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
              ListFooterComponent={
                <View style={styles.groupActions}>
                  {activeConversation.createdBy !== user?.id ? (
                    <Button
                      title="Leave group"
                      variant="secondary"
                      onPress={confirmLeaveGroup}
                      accessibilityLabel="Leave group"
                    />
                  ) : null}
                  {isGroupManager ? (
                    <Button
                      title="Delete group"
                      variant="destructive"
                      onPress={confirmDeleteGroup}
                      accessibilityLabel="Delete group"
                    />
                  ) : null}
                </View>
              }
            />
          </View>
        </Modal>
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
        <Button
          title="+ New Message"
          onPress={() => openNewMessage('direct')}
          accessibilityLabel="Start a new message"
          style={{ flex: 1 }}
        />
        <Button
          title="New Group"
          variant="secondary"
          onPress={() => openNewMessage('group')}
          accessibilityLabel="Create a group"
          leftIcon={<Ionicons name="people-outline" size={16} color={Colors.primary} />}
          style={{ flex: 1 }}
        />
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
            onAction={conversationLoadError ? () => void fetchConversations() : () => openNewMessage('direct')}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => openConversation(item)}
            accessibilityRole="button"
            accessibilityLabel={`${conversationTitle(item)}${item.isGroup ? ' group' : ''}. ${item.unreadCount > 0 ? `${item.unreadCount} unread message${item.unreadCount === 1 ? '' : 's'}.` : 'No unread messages.'} ${item.lastMessage?.text ? `Last message: ${item.lastMessage.text}.` : 'No messages yet.'}`}
          >
            <View style={[styles.avatar, item.isGroup && styles.avatarGroup]}>
              {item.isGroup ? (
                <Ionicons name="people" size={22} color={Colors.textInverse} />
              ) : item.otherUser?.profileImageUrl ? (
                <CachedImage uri={item.otherUser.profileImageUrl} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(item.otherUser?.name) || '?'}</Text>
              )}
            </View>
            <View style={styles.conversationContent}>
              <View style={styles.conversationHeader}>
                <Text style={styles.userName} numberOfLines={1}>
                  {conversationTitle(item)}
                  {item.isGroup && item.memberCount ? (
                    <Text style={styles.memberCountInline}> ({item.memberCount})</Text>
                  ) : null}
                </Text>
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
            <Text style={styles.modalTitle}>
              {pickerMode === 'direct'
                ? 'New Message'
                : pickerMode === 'several'
                  ? 'Message Several'
                  : pickerMode === 'group'
                    ? 'New Group'
                    : 'Add Members'}
            </Text>
            {pickerMode === 'direct' ? (
              <View style={{ width: 60 }} />
            ) : pickerMode === 'several' ? (
              <TouchableOpacity
                onPress={() => void handleSendToSeveral()}
                disabled={sendingBulk || selectedMemberIds.size === 0 || !bulkMessage.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send to selected members"
              >
                <Text
                  style={[
                    styles.modalCancel,
                    (sendingBulk || selectedMemberIds.size === 0 || !bulkMessage.trim()) && styles.disabledText,
                  ]}
                >
                  {sendingBulk ? '...' : 'Send'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void (pickerMode === 'group' ? handleCreateGroup() : handleAddGroupMembers())}
                disabled={
                  savingGroup || selectedMemberIds.size === 0 || (pickerMode === 'group' && !groupName.trim())
                }
                accessibilityRole="button"
                accessibilityLabel={pickerMode === 'group' ? 'Create group' : 'Add selected members'}
              >
                <Text
                  style={[
                    styles.modalCancel,
                    (savingGroup || selectedMemberIds.size === 0 || (pickerMode === 'group' && !groupName.trim())) &&
                      styles.disabledText,
                  ]}
                >
                  {savingGroup ? '...' : pickerMode === 'group' ? 'Create' : 'Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* One-vs-several toggle, the mobile stand-in for web's dialog tabs.
              Groups and the add-members picker keep their own fixed mode. */}
          {pickerMode === 'direct' || pickerMode === 'several' ? (
            <View style={styles.modeToggle}>
              {(['direct', 'several'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeOption, pickerMode === mode && styles.modeOptionActive]}
                  onPress={() => {
                    setPickerMode(mode);
                    setSelectedMemberIds(new Set());
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pickerMode === mode }}
                  accessibilityLabel={mode === 'direct' ? 'Message one person' : 'Message several people'}
                >
                  <Text style={[styles.modeOptionText, pickerMode === mode && styles.modeOptionTextActive]}>
                    {mode === 'direct' ? 'One person' : 'Several people'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {pickerMode === 'several' ? (
            <>
              <Text style={styles.modeHint}>
                Everyone gets this in their own private chat — they won't see each other.
              </Text>
              <Input
                style={styles.bulkMessageInput}
                value={bulkMessage}
                onChangeText={setBulkMessage}
                placeholder="Write the message everyone will receive…"
                accessibilityLabel="Message to send to everyone selected"
                multiline
                maxLength={2000}
              />
            </>
          ) : null}

          {pickerMode === 'group' ? (
            <Input
              style={styles.groupNameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              accessibilityLabel="Group name"
              maxLength={80}
              autoFocus
            />
          ) : null}
          {pickerMode !== 'direct' && selectedMemberIds.size > 0 ? (
            <Text style={styles.selectedCount}>
              {selectedMemberIds.size} selected
              {pickerMode === 'several' ? ` of ${BULK_RECIPIENT_LIMIT} max` : ''}
            </Text>
          ) : null}

          <Input
            style={styles.searchInput}
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="Search members..."
            accessibilityLabel="Search members"
            autoFocus={pickerMode === 'direct'}
          />

          {loadingMembers ? (
            <View style={{ paddingTop: Spacing.sm }}>
              <ConversationSkeleton count={5} />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => item.userId}
              keyboardShouldPersistTaps="handled"
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
                  onAction={memberLoadError ? () => void fetchMembers(memberSearch) : undefined}
                />
              }
              renderItem={({ item }) => {
                const alreadyIn =
                  pickerMode === 'add' && groupMembers.some((m) => m.userId === item.userId);
                const selected = selectedMemberIds.has(item.userId);
                return (
                  <TouchableOpacity
                    style={[styles.memberItem, alreadyIn && styles.memberItemDisabled]}
                    disabled={alreadyIn}
                    onPress={() =>
                      pickerMode === 'direct' ? startConversation(item) : toggleSelectedMember(item.userId)
                    }
                    accessibilityRole="button"
                    accessibilityState={pickerMode === 'direct' ? undefined : { selected, disabled: alreadyIn }}
                    accessibilityLabel={
                      pickerMode === 'direct'
                        ? `Start a conversation with ${item.fullName}${item.skillLevel ? `. Skill level ${item.skillLevel}.` : '.'}`
                        : `${selected ? 'Deselect' : 'Select'} ${item.fullName}`
                    }
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
                      {alreadyIn ? (
                        <Text style={styles.memberMeta}>Already in group</Text>
                      ) : item.skillLevel ? (
                        <Text style={styles.memberMeta}>{item.skillLevel}</Text>
                      ) : null}
                    </View>
                    {pickerMode !== 'direct' && !alreadyIn ? (
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.primary : Colors.border}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
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
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  avatarGroup: {
    backgroundColor: Colors.info,
  },
  memberCountInline: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  senderName: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  threadMeta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  headerIconButton: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  groupSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  groupSectionLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  renameRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  renameInput: {
    flex: 1,
  },
  linkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
  },
  groupActions: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  groupNameInput: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    padding: 3,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTarget.min - 8,
    borderRadius: BorderRadius.sm,
  },
  modeOptionActive: {
    backgroundColor: Colors.card,
  },
  modeOptionText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.medium,
    color: Colors.textMuted,
  },
  modeOptionTextActive: {
    color: Colors.text,
    fontFamily: FontFamily.semiBold,
  },
  modeHint: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  bulkMessageInput: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  selectedCount: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  memberItemDisabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.4,
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
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  messageBubbleRowMe: {
    justifyContent: 'flex-end',
  },
  deleteMessageBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    minWidth: 56,
    alignItems: 'center',
  },
  deleteMessageBtnText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semiBold,
    color: Colors.destructive,
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
