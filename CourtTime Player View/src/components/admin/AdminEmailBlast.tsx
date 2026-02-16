import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Mail, Send, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { adminApi, membersApi } from '../../api/client';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';

interface Member {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  membershipType: string;
}

export function AdminEmailBlast() {
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  useEffect(() => {
    if (selectedFacilityId) {
      loadMembers();
      setSendResult(null);
    }
  }, [selectedFacilityId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const response = await membersApi.getFacilityMembers(selectedFacilityId);
      if (response.success && response.data?.members) {
        setMembers(response.data.members);
      } else {
        toast.error('Failed to load members');
      }
    } finally {
      setLoading(false);
    }
  };

  // Get unique membership types for the filter dropdown
  const membershipTypes = useMemo(() => {
    const types = new Set(members.map(m => m.membershipType).filter(Boolean));
    return Array.from(types);
  }, [members]);

  // Count recipients based on filter
  const filteredRecipients = useMemo(() => {
    if (recipientFilter === 'all') return members;
    if (['active', 'pending', 'suspended', 'expired'].includes(recipientFilter)) {
      return members.filter(m => m.status === recipientFilter);
    }
    // Filter by membership type
    return members.filter(m => m.membershipType === recipientFilter);
  }, [members, recipientFilter]);

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (filteredRecipients.length === 0) {
      toast.error('No recipients match the selected filter');
      return;
    }

    const confirmed = window.confirm(
      `Send email to ${filteredRecipients.length} recipient${filteredRecipients.length !== 1 ? 's' : ''}?\n\nSubject: ${subject}`
    );
    if (!confirmed) return;

    try {
      setSending(true);
      setSendResult(null);
      const response = await adminApi.sendEmailBlast(selectedFacilityId, {
        subject,
        message,
        recipientFilter,
      });

      if (response.success && response.data) {
        const result = response.data;
        setSendResult(result);
        if (result.failed === 0) {
          toast.success(`Email sent to ${result.sent} recipient${result.sent !== 1 ? 's' : ''}`);
        } else {
          toast.warning(`${result.sent} sent, ${result.failed} failed out of ${result.total}`);
        }
      } else {
        toast.error(response.error || 'Failed to send email blast');
      }
    } catch {
      toast.error('An error occurred while sending');
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setSubject('');
    setMessage('');
    setRecipientFilter('all');
    setSendResult(null);
    setShowPreview(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compose Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Recipient Filter */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex items-center gap-3">
              <Select value={recipientFilter} onValueChange={setRecipientFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select recipients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="active">Active Members Only</SelectItem>
                  <SelectItem value="pending">Pending Members</SelectItem>
                  <SelectItem value="suspended">Suspended Members</SelectItem>
                  {membershipTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type} Members
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-sm">
                {filteredRecipients.length} recipient{filteredRecipients.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              placeholder="Enter email subject..."
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="email-message">Message</Label>
            <textarea
              id="email-message"
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Write your message here..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <p className="text-xs text-gray-500">Line breaks will be preserved in the email.</p>
          </div>

          {/* Preview Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-2"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>

          {/* Email Preview */}
          {showPreview && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500 mb-2">Email Preview:</p>
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="bg-green-600 px-6 py-4">
                    <h3 className="text-white font-semibold text-lg">Your Facility</h3>
                  </div>
                  <div className="p-6 border-t-0">
                    <p className="text-gray-700 mb-2">Hi [Member Name],</p>
                    <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                      {message || 'Your message will appear here...'}
                    </div>
                  </div>
                  <div className="px-6 py-3 border-t">
                    <p className="text-gray-400 text-xs">CourtTime - Court Booking Made Simple</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Send Result */}
          {sendResult && (
            <div className={`rounded-lg p-4 ${sendResult.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                {sendResult.failed === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                )}
                <span className="font-medium">
                  {sendResult.failed === 0 ? 'All emails sent successfully!' : 'Some emails failed to send'}
                </span>
              </div>
              <p className="text-sm text-gray-600 ml-7">
                {sendResult.sent} of {sendResult.total} emails sent
                {sendResult.failed > 0 && `, ${sendResult.failed} failed`}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !message.trim() || filteredRecipients.length === 0}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending
                ? 'Sending...'
                : `Send to ${filteredRecipients.length} Recipient${filteredRecipients.length !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={sending}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
