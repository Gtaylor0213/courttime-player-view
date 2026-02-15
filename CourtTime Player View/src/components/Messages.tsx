import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, MessageCircle, Users, X, Plus, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { messagesApi, membersApi } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

interface MessagesProps {
  facilityId: string;
  facilityName?: string;
  selectedRecipientId?: string;
}

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    name: string;
    email: string;
  };
  lastMessage?: {
    text: string;
    sentAt: string;
    senderId: string;
  };
  unreadCount: number;
}

interface Message {
  id: string;
  senderId: string;
  messageText: string;
  createdAt: string;
  isRead: boolean;
}

export function Messages({ facilityId, facilityName, selectedRecipientId }: MessagesProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // For starting new conversations
  const [newConversationUser, setNewConversationUser] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);

  // New Chat Dialog
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [facilityMembers, setFacilityMembers] = useState<any[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Track if we've processed the initial selectedRecipientId
  const [processedRecipientId, setProcessedRecipientId] = useState<string | null>(null);

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
        conv => conv.otherUser.id === selectedRecipientId
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

  const loadRecipientDetails = async (recipientId: string) => {
    try {
      const response = await membersApi.getMemberDetails(facilityId, recipientId);

      if (response.success && response.data?.member) {
        const member = response.data.member;
        // Create a new conversation UI state
        // API returns userId and fullName (not user_id and name)
        setNewConversationUser({
          id: member.userId,
          name: member.fullName,
          email: member.email
        });
        setSelectedConversation(null); // Clear any existing selection
        setMessages([]); // Clear messages
        toast.success(`Starting new conversation with ${member.fullName}`);
      }
    } catch (error) {
      console.error('Error loading recipient details:', error);
      toast.error('Could not load user details');
    }
  };

  const loadFacilityMembers = async () => {
    if (!facilityId) return;

    try {
      setLoadingMembers(true);
      const response = await membersApi.getFacilityMembers(facilityId, memberSearchQuery);

      if (response.success && response.data?.members) {
        // Filter out the current user from the list
        const filteredMembers = response.data.members.filter(
          (member: any) => member.userId !== user?.id
        );
        setFacilityMembers(filteredMembers);
      }
    } catch (error) {
      console.error('Error loading facility members:', error);
      toast.error('Failed to load facility members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleNewChatClick = () => {
    setShowNewChatDialog(true);
    setMemberSearchQuery('');
    loadFacilityMembers();
  };

  const handleSelectMember = (member: any) => {
    // Check if conversation already exists
    const existingConv = conversations.find(
      conv => conv.otherUser.id === member.userId
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
        name: member.fullName,
        email: member.email
      });
      setSelectedConversation(null);
      setMessages([]);
      toast.success(`Starting new conversation with ${member.fullName}`);
    }

    setShowNewChatDialog(false);
  };

  // Load members when search query changes (with debounce)
  useEffect(() => {
    if (showNewChatDialog) {
      const timer = setTimeout(() => {
        loadFacilityMembers();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [memberSearchQuery, showNewChatDialog]);

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

    // Determine recipient ID
    let recipientId: string | null = null;

    if (newConversationUser) {
      recipientId = newConversationUser.id;
    } else if (selectedConversation) {
      const selectedConv = conversations.find(c => c.id === selectedConversation);
      if (selectedConv) {
        recipientId = selectedConv.otherUser.id;
      }
    }

    // Ensure we have a recipient
    if (!recipientId) {
      console.error('No recipient selected');
      toast.error('Please select a recipient');
      return;
    }

    try {
      setSending(true);
      const response = await messagesApi.sendMessage(
        user.id,
        recipientId,
        facilityId,
        newMessage
      );

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

  const filteredConversations = conversations.filter(conv =>
    conv.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-white rounded-lg border" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex bg-white rounded-lg border overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
      {/* Conversations List */}
      <div className="w-80 border-r flex flex-col h-full">
        <div className="flex-shrink-0 p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Messages</h2>
            <Button
              size="sm"
              onClick={handleNewChatClick}
              className="bg-green-600 hover:bg-green-700"
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
                    <AvatarFallback className="bg-green-100 text-green-700">
                      {getInitials(conv.otherUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">
                        {conv.otherUser.name}
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
      <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
        {selectedConv || newConversationUser ? (
          <div className="flex flex-col h-full">
            {/* Chat Header - Fixed */}
            <div className="flex-shrink-0 p-4 border-b flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-green-100 text-green-700">
                    {getInitials(selectedConv?.otherUser.name || newConversationUser?.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">
                    {selectedConv?.otherUser.name || newConversationUser?.name}
                  </h3>
                  <p className="text-sm text-gray-500">{facilityName}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedConversation(null);
                  setNewConversationUser(null);
                }}
                className="lg:hidden"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.senderId === user?.id ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.senderId === user?.id
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.messageText}
                      </p>
                      <p
                        className={`text-xs mt-1 ${
                          message.senderId === user?.id
                            ? 'text-green-100'
                            : 'text-gray-500'
                        }`}
                      >
                        {formatMessageTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
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
                  className="bg-green-600 hover:bg-green-700"
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
              Start New Conversation
            </DialogTitle>
            <DialogDescription>
              Select a facility member or admin to start chatting
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            {/* Members List */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
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
                    <Avatar>
                      <AvatarFallback className="bg-green-100 text-green-700">
                        {getInitials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.fullName}</p>
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
