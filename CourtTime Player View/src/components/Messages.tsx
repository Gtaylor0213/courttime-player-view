import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, MessageCircle, Users, X, Plus, UserPlus, ChevronLeft, Trash2, Settings, LogOut } from 'lucide-react';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { messagesApi } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';

/** Groups are capped at 30 members, including the creator. */
const GROUP_MEMBER_LIMIT = 30;

interface MessagesProps {
  facilityId: string;
  facilityName?: string;
  selectedRecipientId?: string;
  selectedConversationId?: string;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  otherUser?: {
    id: string;
    name: string;
    email: string;
  };
  groupName?: string;
  memberCount?: number;
  createdBy?: string;
  lastMessage?: {
    text: string;
    sentAt: string;
    senderId: string;
  };
  unreadCount: number;
}

interface GroupMember {
  userId: string;
  fullName: string;
  isFacilityAdmin: boolean;
  isCreator: boolean;
}

interface Message {
  id: string;
  senderId: string;
  messageText: string;
  createdAt: string;
  isRead: boolean;
}

export function Messages({ facilityId, facilityName, selectedRecipientId, selectedConversationId }: MessagesProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // For starting new conversations
  const [newConversationUser, setNewConversationUser] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // New Chat Dialog
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'dm' | 'group'>('dm');
  const [facilityMembers, setFacilityMembers] = useState<any[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null);
  // Guards against a slower earlier search overwriting a newer one.
  const memberRequestId = useRef(0);

  // New Group creation
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Group info / management dialog
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savingGroupAction, setSavingGroupAction] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);

  // Track if we've processed the initial selectedRecipientId / selectedConversationId
  const [processedRecipientId, setProcessedRecipientId] = useState<string | null>(null);
  const [processedConversationId, setProcessedConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (facilityId && user?.id) {
      loadConversations();
    }
  }, [facilityId, user?.id]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation);
      // Mark messages as read
      markAsRead(selectedConversation);

      // Load member names for group sender labels
      const conv = conversations.find(c => c.id === selectedConversation);
      if (conv?.isGroup) {
        loadGroupMembers(selectedConversation);
      } else {
        setGroupMembers([]);
      }
    }
  }, [selectedConversation]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

  // Auto-select conversation when recipient is specified
  useEffect(() => {
    // Only process if we have a new selectedRecipientId that we haven't processed yet
    if (selectedRecipientId && user?.id && facilityId && selectedRecipientId !== processedRecipientId) {
      // Try to find existing conversation with this recipient
      const existingConv = conversations.find(
        conv => conv.otherUser?.id === selectedRecipientId
      );

      if (existingConv) {
        // Select the existing conversation
        setSelectedConversation(existingConv.id);
        setNewConversationUser(null);
        setProcessedRecipientId(selectedRecipientId);
      } else if (!loading) {
        // Only load recipient details after conversations have finished loading
        // This ensures we don't miss an existing conversation that's still loading
        loadRecipientDetails(selectedRecipientId);
        setProcessedRecipientId(selectedRecipientId);
      }
    }
  }, [selectedRecipientId, conversations, user?.id, facilityId, loading, processedRecipientId]);

  // Auto-select conversation when a conversationId deep link is specified
  // (used for group-message notifications, which have no single "recipient").
  useEffect(() => {
    if (selectedConversationId && user?.id && facilityId && selectedConversationId !== processedConversationId && !loading) {
      const existingConv = conversations.find(conv => conv.id === selectedConversationId);
      if (existingConv) {
        setSelectedConversation(existingConv.id);
        setNewConversationUser(null);
      }
      setProcessedConversationId(selectedConversationId);
    }
  }, [selectedConversationId, conversations, user?.id, facilityId, loading, processedConversationId]);

  const loadRecipientDetails = async (recipientId: string) => {
    try {
      const response = await messagesApi.getDirectoryMember(facilityId, recipientId);
      const member = response.data?.data?.member || response.data?.member;

      if (response.success && member) {
        // Create a new conversation UI state
        // API returns userId and fullName (not user_id and name)
        setNewConversationUser({
          id: member.userId,
          name: member.fullName
        });
        setSelectedConversation(null); // Clear any existing selection
        setMessages([]); // Clear messages
        toast.success(`Starting new conversation with ${member.fullName}`);
      } else {
        toast.error(response.error || 'Could not load user details');
      }
    } catch (error) {
      console.error('Error loading recipient details:', error);
      toast.error('Could not load user details');
    }
  };

  const loadFacilityMembers = async () => {
    if (!facilityId) return;

    const requestId = ++memberRequestId.current;
    const isCurrent = () => requestId === memberRequestId.current;

    try {
      setLoadingMembers(true);
      setMemberLoadError(null);
      const response = await messagesApi.getDirectory(
        facilityId,
        memberSearchQuery.trim() || undefined
      );
      if (!isCurrent()) return;

      const members = response.data?.data?.members || response.data?.members;
      if (response.success && members) {
        setFacilityMembers(members);
      } else {
        setFacilityMembers([]);
        setMemberLoadError(response.error || 'Failed to load facility members');
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Error loading facility members:', error);
      setFacilityMembers([]);
      setMemberLoadError('Failed to load facility members');
    } finally {
      if (isCurrent()) setLoadingMembers(false);
    }
  };

  const handleNewChatClick = () => {
    setShowNewChatDialog(true);
    setNewChatMode('dm');
    setMemberSearchQuery('');
    setFacilityMembers([]);
    setMemberLoadError(null);
    setLoadingMembers(true);
    setGroupName('');
    setSelectedMemberIds(new Set());
  };

  const handleSelectMember = (member: any) => {
    if (newChatMode === 'group') {
      setSelectedMemberIds(prev => {
        const next = new Set(prev);
        if (next.has(member.userId)) {
          next.delete(member.userId);
        } else if (next.size + 1 < GROUP_MEMBER_LIMIT) {
          // +1 accounts for the creator, who isn't in this set
          next.add(member.userId);
        } else {
          toast.error(`Groups are limited to ${GROUP_MEMBER_LIMIT} members`);
        }
        return next;
      });
      return;
    }

    // Check if conversation already exists
    const existingConv = conversations.find(
      conv => conv.otherUser?.id === member.userId
    );

    if (existingConv) {
      // Select existing conversation
      setSelectedConversation(existingConv.id);
      setNewConversationUser(null);
      toast.info(`Opened existing conversation with ${member.fullName}`);
    } else {
      // Start new conversation
      setNewConversationUser({
        id: member.userId,
        name: member.fullName
      });
      setSelectedConversation(null);
      setMessages([]);
      toast.success(`Starting new conversation with ${member.fullName}`);
    }

    setShowNewChatDialog(false);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Group name is required');
      return;
    }
    if (selectedMemberIds.size === 0) {
      toast.error('Select at least one other member');
      return;
    }

    try {
      setCreatingGroup(true);
      const response = await messagesApi.createGroup(facilityId, groupName.trim(), Array.from(selectedMemberIds));
      const conversationId = response.data?.data?.conversationId || response.data?.conversationId;
      if (response.success && conversationId) {
        toast.success(`Created group "${groupName.trim()}"`);
        setShowNewChatDialog(false);
        setNewConversationUser(null);
        await loadConversations();
        setSelectedConversation(conversationId);
      } else {
        toast.error(response.error || 'Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Load members when the New Chat dialog or the group "Add Members" picker is
  // open, then debounce while the user types.
  useEffect(() => {
    if (!showNewChatDialog && !addingMembers) return;

    const timer = setTimeout(() => {
      loadFacilityMembers();
    }, memberSearchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [memberSearchQuery, showNewChatDialog, addingMembers]);

  const loadGroupMembers = async (conversationId: string) => {
    try {
      setLoadingGroupMembers(true);
      const response = await messagesApi.getGroupMembers(conversationId);
      const members = response.data?.data?.members || response.data?.members;
      if (response.success && members) {
        setGroupMembers(members);
      } else {
        toast.error(response.error || 'Failed to load group members');
      }
    } catch (error) {
      console.error('Error loading group members:', error);
      toast.error('Failed to load group members');
    } finally {
      setLoadingGroupMembers(false);
    }
  };

  const handleOpenGroupInfo = () => {
    if (!selectedConv?.isGroup) return;
    setRenameValue(selectedConv.groupName || '');
    setAddingMembers(false);
    setMemberSearchQuery('');
    setShowGroupInfo(true);
    loadGroupMembers(selectedConv.id);
  };

  const isGroupManager = (conv: Conversation | undefined) => {
    if (!conv?.isGroup || !user?.id) return false;
    if (conv.createdBy === user.id) return true;
    return !!groupMembers.find(m => m.userId === user.id && m.isFacilityAdmin);
  };

  const handleRenameGroup = async () => {
    if (!selectedConv || !renameValue.trim()) return;
    try {
      setSavingGroupAction(true);
      const response = await messagesApi.renameGroup(selectedConv.id, renameValue.trim());
      if (response.success) {
        toast.success('Group renamed');
        await loadConversations();
      } else {
        toast.error(response.error || 'Failed to rename group');
      }
    } catch (error) {
      console.error('Error renaming group:', error);
      toast.error('Failed to rename group');
    } finally {
      setSavingGroupAction(false);
    }
  };

  const handleAddGroupMembers = async () => {
    if (!selectedConv || selectedMemberIds.size === 0) return;
    try {
      setSavingGroupAction(true);
      const response = await messagesApi.addGroupMembers(selectedConv.id, Array.from(selectedMemberIds));
      if (response.success) {
        toast.success('Members added');
        setSelectedMemberIds(new Set());
        setAddingMembers(false);
        await Promise.all([loadConversations(), loadGroupMembers(selectedConv.id)]);
      } else {
        toast.error(response.error || 'Failed to add members');
      }
    } catch (error) {
      console.error('Error adding group members:', error);
      toast.error('Failed to add members');
    } finally {
      setSavingGroupAction(false);
    }
  };

  const handleRemoveGroupMember = async (memberId: string) => {
    if (!selectedConv) return;
    try {
      const response = await messagesApi.removeGroupMember(selectedConv.id, memberId);
      if (response.success) {
        toast.success('Member removed');
        await Promise.all([loadConversations(), loadGroupMembers(selectedConv.id)]);
      } else {
        toast.error(response.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing group member:', error);
      toast.error('Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedConv || !user?.id) return;
    if (!window.confirm('Leave this group? You will no longer see its messages.')) return;
    try {
      const response = await messagesApi.removeGroupMember(selectedConv.id, user.id);
      if (response.success) {
        toast.success('You left the group');
        setShowGroupInfo(false);
        setSelectedConversation(null);
        await loadConversations();
      } else {
        toast.error(response.error || 'Failed to leave group');
      }
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Failed to leave group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedConv) return;
    if (!window.confirm('Delete this group for everyone? This cannot be undone.')) return;
    try {
      const response = await messagesApi.deleteGroup(selectedConv.id);
      if (response.success) {
        toast.success('Group deleted');
        setShowGroupInfo(false);
        setSelectedConversation(null);
        await loadConversations();
      } else {
        toast.error(response.error || 'Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await messagesApi.getConversations(facilityId, user.id);

      if (response.success && response.data?.data?.conversations) {
        setConversations(response.data.data.conversations);
      } else if (response.success && response.data?.conversations) {
        setConversations(response.data.conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await messagesApi.getMessages(conversationId);

      if (response.success && response.data?.data?.messages) {
        setMessages(response.data.data.messages);
      } else if (response.success && response.data?.messages) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    }
  };

  const markAsRead = async (conversationId: string) => {
    if (!user?.id) return;

    try {
      await messagesApi.markAsRead(conversationId, user.id);
      // Reload conversations to update unread count
      loadConversations();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user?.id) return;

    const currentConv = selectedConversation ? conversations.find(c => c.id === selectedConversation) : null;

    // Determine recipient ID (DMs only — groups send by conversation id)
    let recipientId: string | null = null;

    if (!currentConv?.isGroup) {
      if (newConversationUser) {
        recipientId = newConversationUser.id;
      } else if (currentConv) {
        recipientId = currentConv.otherUser?.id ?? null;
      }

      if (!recipientId) {
        console.error('No recipient selected');
        toast.error('Please select a recipient');
        return;
      }
    }

    try {
      setSending(true);
      const response = currentConv?.isGroup
        ? await messagesApi.sendToConversation(currentConv.id, newMessage)
        : await messagesApi.sendMessage(user.id, recipientId as string, facilityId, newMessage);

      if (response.success && response.data?.data?.message) {
        setMessages(prev => [...prev, response.data.data.message]);
      } else if (response.success && response.data?.message) {
        setMessages(prev => [...prev, response.data.message]);
      }

      setNewMessage('');

      // Reload conversations to get/update the conversation
      await loadConversations();

      // Clear new conversation user after first message
      if (newConversationUser) {
        setNewConversationUser(null);
      }

      toast.success('Message sent!');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user?.id) return;
    if (!window.confirm('Delete this message? The other person will no longer see it.')) return;

    try {
      setDeletingMessageId(messageId);
      const response = await messagesApi.deleteMessage(messageId, user.id);
      if (response.success) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        await loadConversations();
        toast.success('Message deleted');
      } else {
        toast.error(response.error || 'Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (diffDays === 0) {
      return `Today at ${timeStr}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${timeStr}`;
    } else if (diffDays < 7) {
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      return `${dayStr} at ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr} at ${timeStr}`;
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getConversationName = (conv: Conversation) =>
    conv.isGroup ? (conv.groupName || 'Group') : (conv.otherUser?.name || 'Unknown');

  const filteredConversations = conversations.filter(conv =>
    getConversationName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.id === selectedConversation);
  const manageableAsGroup = isGroupManager(selectedConv);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-card" style={{ height: 'calc(100dvh - 160px)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-lg border bg-card" style={{ height: 'calc(100dvh - 160px)' }}>
      {/* Conversations List */}
      <div className={cn(
        'w-full md:w-80 border-r flex flex-col h-full',
        (selectedConversation || newConversationUser) ? 'hidden md:flex' : 'flex'
      )}>
        <div className="flex-shrink-0 p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Messages</h2>
            <Button
              size="sm"
              onClick={handleNewChatClick}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Chat
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <MessageCircle className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">
                {searchQuery ? 'No conversations found' : 'No messages yet'}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                {!searchQuery && 'Start a conversation from the Hitting Partners tab'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation === conv.id ? 'bg-green-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar>
                    <AvatarFallback className={conv.isGroup ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                      {conv.isGroup ? <Users className="h-4 w-4" /> : getInitials(conv.otherUser?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">
                        {getConversationName(conv)}
                        {conv.isGroup && conv.memberCount ? (
                          <span className="text-xs text-gray-400 font-normal ml-1">({conv.memberCount})</span>
                        ) : null}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-500">
                          {formatMessageTime(conv.lastMessage.sentAt)}
                        </span>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-sm text-gray-600 truncate">
                        {conv.lastMessage.senderId === user?.id ? 'You: ' : ''}
                        {conv.lastMessage.text}
                      </p>
                    )}
                  </div>
                  {conv.unreadCount > 0 && (
                    <Badge className="bg-green-600 text-white text-xs">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className={cn(
        'flex-1 flex flex-col min-h-0 h-full overflow-hidden',
        (!selectedConversation && !newConversationUser) ? 'hidden md:flex' : 'flex'
      )}>
        {selectedConv || newConversationUser ? (
          <div className="flex flex-col h-full">
            {/* Chat Header - Fixed */}
            <div className="flex-shrink-0 p-4 border-b flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                {/* Mobile back button */}
                <button
                  onClick={() => { setSelectedConversation(null); setNewConversationUser(null); }}
                  className="md:hidden p-2 -ml-2 mr-1 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-label="Back to conversations"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <Avatar>
                  <AvatarFallback className={selectedConv?.isGroup ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                    {selectedConv?.isGroup ? <Users className="h-4 w-4" /> : getInitials(selectedConv?.otherUser?.name || newConversationUser?.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">
                    {selectedConv ? getConversationName(selectedConv) : newConversationUser?.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedConv?.isGroup && selectedConv.memberCount
                      ? `${selectedConv.memberCount} members`
                      : facilityName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selectedConv?.isGroup && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenGroupInfo}
                    aria-label="Group info"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedConversation(null);
                  setNewConversationUser(null);
                }}
                className="hidden"
              >
                <X className="h-4 w-4" />
              </Button>
              </div>
            </div>

            {/* Messages - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  const senderName = selectedConv?.isGroup && !isMine
                    ? groupMembers.find(m => m.userId === message.senderId)?.fullName
                    : null;
                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-1 ${
                        isMine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {isMine && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-gray-500 hover:text-red-600 hover:bg-red-50 md:self-end"
                          onClick={() => deleteMessage(message.id)}
                          disabled={deletingMessageId === message.id}
                          aria-label="Delete message"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          isMine ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        {senderName && (
                          <p className="text-xs font-medium text-gray-500 mb-0.5">{senderName}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {message.messageText}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            isMine ? 'text-green-100' : 'text-gray-500'
                          }`}
                        >
                          {formatMessageTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input - Fixed at bottom */}
            <div className="flex-shrink-0 p-4 border-t bg-white">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={sending}
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <Users className="h-16 w-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm text-gray-400 mt-1">
              Choose a conversation from the list to start messaging
            </p>
          </div>
        )}
      </div>

      {/* New Chat Dialog */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              {newChatMode === 'group' ? 'Create Group' : 'Start New Conversation'}
            </DialogTitle>
            <DialogDescription>
              {newChatMode === 'group'
                ? `Name your group and add up to ${GROUP_MEMBER_LIMIT - 1} other members`
                : 'Select a facility member or admin to start chatting'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Tabs value={newChatMode} onValueChange={(v) => { setNewChatMode(v as 'dm' | 'group'); setSelectedMemberIds(new Set()); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dm">Direct Message</TabsTrigger>
                <TabsTrigger value="group">New Group</TabsTrigger>
              </TabsList>
            </Tabs>

            {newChatMode === 'group' && (
              <Input
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={100}
              />
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search members..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {newChatMode === 'group' && (
              <p className="text-xs text-gray-500">
                {selectedMemberIds.size + 1}/{GROUP_MEMBER_LIMIT} members selected (including you)
              </p>
            )}

            {/* Members List */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : memberLoadError ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm">{memberLoadError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={loadFacilityMembers}
                  >
                    Try again
                  </Button>
                </div>
              ) : facilityMembers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm">
                    {memberSearchQuery ? 'No members found' : 'No members available'}
                  </p>
                </div>
              ) : (
                facilityMembers.map((member) => (
                  <div
                    key={member.userId}
                    onClick={() => handleSelectMember(member)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                  >
                    {newChatMode === 'group' && (
                      <Checkbox
                        checked={selectedMemberIds.has(member.userId)}
                        onCheckedChange={() => handleSelectMember(member)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <Avatar>
                      <AvatarFallback className="bg-green-100 text-green-700">
                        {getInitials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.fullName}</p>
                      {member.isFacilityAdmin && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {newChatMode === 'group' && (
              <Button
                className="w-full"
                onClick={handleCreateGroup}
                disabled={creatingGroup || !groupName.trim() || selectedMemberIds.size === 0}
              >
                {creatingGroup ? 'Creating…' : 'Create Group'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Info / Management Dialog */}
      <Dialog open={showGroupInfo} onOpenChange={setShowGroupInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Group Info
            </DialogTitle>
            <DialogDescription>
              {selectedConv?.memberCount ? `${selectedConv.memberCount} members` : 'Manage this group'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {manageableAsGroup && (
              <div className="flex gap-2">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={100}
                  placeholder="Group name"
                />
                <Button
                  size="sm"
                  onClick={handleRenameGroup}
                  disabled={savingGroupAction || !renameValue.trim() || renameValue.trim() === selectedConv?.groupName}
                >
                  Save
                </Button>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto space-y-1">
              {loadingGroupMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : (
                groupMembers.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 p-2 rounded-lg">
                    <Avatar>
                      <AvatarFallback className="bg-green-100 text-green-700">
                        {getInitials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.fullName}</p>
                      <div className="flex gap-1 mt-0.5">
                        {member.isCreator && <Badge variant="secondary" className="text-xs">Creator</Badge>}
                        {member.isFacilityAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                      </div>
                    </div>
                    {manageableAsGroup && !member.isCreator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveGroupMember(member.userId)}
                        aria-label={`Remove ${member.fullName}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            {manageableAsGroup && (
              addingMembers ? (
                <div className="space-y-2 border-t pt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search members to add..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {facilityMembers
                      .filter(m => !groupMembers.some(gm => gm.userId === m.userId))
                      .map((member) => {
                        const toggle = () => setSelectedMemberIds(prev => {
                          const next = new Set(prev);
                          if (next.has(member.userId)) {
                            next.delete(member.userId);
                          } else if (groupMembers.length + next.size + 1 < GROUP_MEMBER_LIMIT) {
                            next.add(member.userId);
                          } else {
                            toast.error(`Groups are limited to ${GROUP_MEMBER_LIMIT} members`);
                          }
                          return next;
                        });
                        return (
                          <div
                            key={member.userId}
                            onClick={toggle}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedMemberIds.has(member.userId)}
                              onCheckedChange={toggle}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <p className="text-sm truncate">{member.fullName}</p>
                          </div>
                        );
                      })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      size="sm"
                      onClick={handleAddGroupMembers}
                      disabled={savingGroupAction || selectedMemberIds.size === 0}
                    >
                      Add Selected
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setAddingMembers(false); setSelectedMemberIds(new Set()); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setAddingMembers(true); setSelectedMemberIds(new Set()); setMemberSearchQuery(''); }}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Add Members
                </Button>
              )
            )}

            <div className="flex gap-2 border-t pt-3">
              {selectedConv?.createdBy !== user?.id && (
                <Button variant="outline" className="flex-1 text-gray-700" onClick={handleLeaveGroup}>
                  <LogOut className="h-4 w-4 mr-1" />
                  Leave Group
                </Button>
              )}
              {manageableAsGroup && (
                <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700" onClick={handleDeleteGroup}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Group
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
