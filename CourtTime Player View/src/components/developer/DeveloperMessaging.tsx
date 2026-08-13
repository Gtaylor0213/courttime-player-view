import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Send, Loader2, X, Inbox as InboxIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  getFacilities,
  searchPlayers,
  searchAdmins,
  previewDeveloperMessages,
  sendDeveloperMessages,
  getTeamConversations,
  getTeamConversationMessages,
  replyToTeamConversation,
  BroadcastFilters,
} from '../../api/supportClient';

interface Facility {
  id: string;
  name: string;
}

interface PlayerResult {
  id: string;
  fullName: string;
  email: string;
}

interface ConversationSummary {
  conversationId: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  lastMessageText: string | null;
  lastMessageSenderId: string | null;
  lastMessageSentAt: string | null;
  unreadCount: number;
}

interface ConversationMessage {
  id: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
}

const COURTTIME_TEAM_USER_ID = '00000000-0000-0000-0000-000000000001';

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;
  if (diffDays < 7) return `${date.toLocaleDateString('en-US', { weekday: 'short' })} at ${timeStr}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`;
}

type Audience = 'all' | 'facility' | 'specific';
type RecipientType = 'player' | 'admin';

export function DeveloperMessaging() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  return (
    <Tabs defaultValue="compose">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="compose" className="gap-2">
          <Send className="h-4 w-4 shrink-0" />
          Compose
        </TabsTrigger>
        <TabsTrigger value="inbox" className="gap-2">
          <InboxIcon className="h-4 w-4 shrink-0" />
          Inbox
          {totalUnread > 0 && (
            <Badge className="bg-green-600 text-white text-xs ml-1">{totalUnread}</Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="compose" className="mt-4">
        <ComposeTab />
      </TabsContent>

      <TabsContent value="inbox" className="mt-4">
        <InboxTab conversations={conversations} setConversations={setConversations} />
      </TabsContent>
    </Tabs>
  );
}

function ComposeTab() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [audience, setAudience] = useState<Audience>('all');
  const [facilityId, setFacilityId] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerResult[]>([]);
  const [recipientType, setRecipientType] = useState<RecipientType>('player');
  const [neverMessagedOnly, setNeverMessagedOnly] = useState(false);
  const [useJoinedRange, setUseJoinedRange] = useState(false);
  const [joinedFrom, setJoinedFrom] = useState('');
  const [joinedTo, setJoinedTo] = useState('');
  const [messageText, setMessageText] = useState('');

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<PlayerResult[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getFacilities().then((res) => {
      if (res.success) setFacilities(res.data || []);
    });
  }, []);

  useEffect(() => {
    if (playerQuery.trim().length < 2) {
      setPlayerResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = recipientType === 'admin' ? await searchAdmins(playerQuery.trim()) : await searchPlayers(playerQuery.trim());
      if (res.success) setPlayerResults(res.data || []);
    }, 300);
    return () => clearTimeout(handle);
  }, [playerQuery, recipientType]);

  // Switching recipient type invalidates any facility/specific-people picks
  // made under the other type (e.g. a facility chosen for "admins at a
  // facility" doesn't necessarily still make sense as a player filter).
  const handleRecipientTypeChange = (type: RecipientType) => {
    setRecipientType(type);
    setFacilityId('');
    setSelectedPlayers([]);
    setPlayerQuery('');
    setPlayerResults([]);
  };

  const filters: BroadcastFilters = useMemo(() => ({
    recipientType,
    audience,
    facilityId: audience === 'facility' ? facilityId : undefined,
    userIds: audience === 'specific' ? selectedPlayers.map((p) => p.id) : undefined,
    neverMessagedOnly,
    joinedFrom: useJoinedRange && joinedFrom ? joinedFrom : undefined,
    joinedTo: useJoinedRange && joinedTo ? joinedTo : undefined,
  }), [recipientType, audience, facilityId, selectedPlayers, neverMessagedOnly, useJoinedRange, joinedFrom, joinedTo]);

  const audienceReady =
    audience === 'all' || (audience === 'facility' && !!facilityId) || (audience === 'specific' && selectedPlayers.length > 0);

  const loadPreview = useCallback(async () => {
    if (!audienceReady) {
      setPreviewCount(null);
      setPreviewSample([]);
      return;
    }
    setPreviewing(true);
    try {
      const res = await previewDeveloperMessages(filters);
      if (res.success) {
        setPreviewCount(res.data.count);
        setPreviewSample(res.data.sample || []);
      } else {
        toast.error(res.error || 'Failed to preview recipients');
      }
    } finally {
      setPreviewing(false);
    }
  }, [filters, audienceReady]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const addPlayer = (player: PlayerResult) => {
    if (!selectedPlayers.some((p) => p.id === player.id)) {
      setSelectedPlayers((prev) => [...prev, player]);
    }
    setPlayerQuery('');
    setPlayerResults([]);
  };

  const removePlayer = (id: string) => {
    setSelectedPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSend = async () => {
    if (!messageText.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!previewCount) {
      toast.error('No recipients match the selected filters');
      return;
    }

    const recipientLabel = recipientType === 'admin' ? 'admin' : 'player';
    const confirmed = window.confirm(
      `Send this message to ${previewCount} ${recipientLabel}${previewCount !== 1 ? 's' : ''}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const res = await sendDeveloperMessages(filters, messageText.trim());
      if (res.success) {
        toast.success(`Message queued for ${res.data.queued} ${recipientLabel}${res.data.queued !== 1 ? 's' : ''}`);
        setMessageText('');
      } else {
        toast.error(res.error || 'Failed to send messages');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compose Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Recipient type */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Select value={recipientType} onValueChange={(v) => handleRecipientTypeChange(v as RecipientType)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select recipient type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Players</SelectItem>
                <SelectItem value="admin">Facility Admins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{recipientType === 'admin' ? 'All Admins' : 'All Players'}</SelectItem>
                <SelectItem value="facility">{recipientType === 'admin' ? 'Admins of a Facility' : 'Players at a Facility'}</SelectItem>
                <SelectItem value="specific">{recipientType === 'admin' ? 'Specific Admins' : 'Specific Players'}</SelectItem>
              </SelectContent>
            </Select>

            {audience === 'facility' && (
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select facility" />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {audience === 'specific' && (
              <div className="space-y-2">
                <Input
                  placeholder={recipientType === 'admin' ? 'Search admins by name or email...' : 'Search players by name or email...'}
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  className="w-80"
                />
                {playerResults.length > 0 && (
                  <div className="border rounded-md bg-white shadow-sm w-80 max-h-48 overflow-y-auto">
                    {playerResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addPlayer(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                      >
                        <div>{p.fullName}</div>
                        <div className="text-xs text-gray-500">{p.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPlayers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedPlayers.map((p) => (
                      <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
                        {p.fullName}
                        <button type="button" onClick={() => removePlayer(p.id)} className="ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Narrowing filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="never-messaged"
                checked={neverMessagedOnly}
                onCheckedChange={(checked) => setNeverMessagedOnly(checked === true)}
              />
              <Label htmlFor="never-messaged" className="font-normal">
                Only {recipientType === 'admin' ? 'admins' : 'players'} who've never gotten a message from us
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="joined-range"
                checked={useJoinedRange}
                onCheckedChange={(checked) => setUseJoinedRange(checked === true)}
              />
              <Label htmlFor="joined-range" className="font-normal">
                Only {recipientType === 'admin' ? 'admins' : 'players'} who joined within a date range
              </Label>
            </div>
            {useJoinedRange && (
              <div className="flex items-center gap-3 pl-6">
                <Input type="date" value={joinedFrom} onChange={(e) => setJoinedFrom(e.target.value)} className="w-44" />
                <span className="text-sm text-gray-500">to</span>
                <Input type="date" value={joinedTo} onChange={(e) => setJoinedTo(e.target.value)} className="w-44" />
              </div>
            )}
          </div>

          {/* Recipient preview */}
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              {previewing ? 'Counting...' : `${previewCount ?? 0} recipient${previewCount === 1 ? '' : 's'}`}
            </Badge>
            {previewSample.length > 0 && (
              <span className="text-xs text-gray-500 truncate max-w-md">
                {previewSample.slice(0, 5).map((p) => p.fullName).join(', ')}
                {previewCount && previewCount > 5 ? `, +${previewCount - 5} more` : ''}
              </span>
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-message">Message</Label>
            <textarea
              id="broadcast-message"
              className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Write your message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />
            <p className="text-xs text-gray-500">Sent as "CourtTime Team" through each recipient's Messages inbox.</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSend}
              disabled={sending || !messageText.trim() || !previewCount}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending
                ? 'Sending...'
                : `Send to ${previewCount ?? 0} ${recipientType === 'admin' ? 'Admin' : 'Player'}${previewCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface InboxTabProps {
  conversations: ConversationSummary[];
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
}

function InboxTab({ conversations, setConversations }: InboxTabProps) {
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTeamConversations();
      if (res.success) {
        setConversations(res.data || []);
      } else {
        toast.error(res.error || 'Failed to load conversations');
      }
    } finally {
      setLoading(false);
    }
  }, [setConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const openConversation = async (conversationId: string) => {
    setSelectedId(conversationId);
    setMessagesLoading(true);
    try {
      const res = await getTeamConversationMessages(conversationId);
      if (res.success) {
        setMessages(res.data || []);
        // Opening the thread marks it read server-side; reflect that locally
        // without waiting on a full conversations refetch.
        setConversations((prev) =>
          prev.map((c) => (c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c))
        );
      } else {
        toast.error(res.error || 'Failed to load conversation');
      }
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selectedId || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await replyToTeamConversation(selectedId, replyText.trim());
      if (res.success) {
        setReplyText('');
        await openConversation(selectedId);
        await loadConversations();
      } else {
        toast.error(res.error || 'Failed to send reply');
      }
    } finally {
      setSendingReply(false);
    }
  };

  const selectedConversation = conversations.find((c) => c.conversationId === selectedId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 pb-6">No conversations yet.</p>
          ) : (
            <div className="divide-y max-h-[520px] overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.conversationId}
                  type="button"
                  onClick={() => openConversation(c.conversationId)}
                  className={`w-full text-left px-6 py-3 hover:bg-gray-50 flex items-start gap-3 ${
                    selectedId === c.conversationId ? 'bg-gray-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">{c.playerName}</span>
                      {c.lastMessageSentAt && (
                        <span className="text-xs text-gray-500 shrink-0 ml-2">
                          {formatMessageTime(c.lastMessageSentAt)}
                        </span>
                      )}
                    </div>
                    {c.lastMessageText && (
                      <p className="text-sm text-gray-600 truncate">
                        {c.lastMessageSenderId === COURTTIME_TEAM_USER_ID ? 'You: ' : ''}
                        {c.lastMessageText}
                      </p>
                    )}
                  </div>
                  {c.unreadCount > 0 && (
                    <Badge className="bg-green-600 text-white text-xs shrink-0">{c.unreadCount}</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedConversation ? selectedConversation.playerName : 'Select a conversation'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedId ? (
            <p className="text-sm text-gray-500">Pick a conversation on the left to view the thread.</p>
          ) : messagesLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {messages.map((m) => {
                  const isMine = m.senderId === COURTTIME_TEAM_USER_ID;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                          isMine ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="whitespace-pre-line">{m.messageText}</p>
                        <p className={`text-xs mt-1 ${isMine ? 'text-green-100' : 'text-gray-500'}`}>
                          {formatMessageTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-end gap-2 pt-4 border-t mt-4">
                <textarea
                  className="flex min-h-[60px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Write a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <Button
                  onClick={handleReply}
                  disabled={sendingReply || !replyText.trim()}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
