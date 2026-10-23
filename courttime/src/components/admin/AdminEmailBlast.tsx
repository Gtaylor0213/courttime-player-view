import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Send, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { adminApi, membersApi, facilitiesApi } from '../../api/client';
import type { EmailBlastJob } from '../../../shared/types';
import { toast } from 'sonner';
import { useAppContext } from '../../contexts/AppContext';

interface Member {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  membershipType: string;
}

const POLL_INTERVAL_MS = 2000;
/** A finished blast stays on screen (and is offered on reload) for this long. */
const RECENT_MS = 30 * 60 * 1000;

function isRecent(job: EmailBlastJob) {
  return Date.now() - Date.parse(job.startedAt) < RECENT_MS;
}

function minutesAgo(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return minutes < 1 ? 'just now' : `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
}

function announceResult(job: EmailBlastJob) {
  if (job.sent === 0) {
    toast.error('All emails failed to send.');
  } else if (job.failed === 0) {
    toast.success(`${job.sent} of ${job.total} emails sent successfully`);
  } else {
    toast.warning(`${job.sent} of ${job.total} emails sent. ${job.failed} failed.`);
  }
}

function EmailBlastStatusPanel({ job }: { job: EmailBlastJob }) {
  const done = job.status === 'done';
  const processed = job.sent + job.failed;
  const tone = !done
    ? 'bg-blue-50 border-blue-200'
    : job.sent === 0
      ? 'bg-red-50 border-red-200'
      : job.failed > 0
        ? 'bg-yellow-50 border-yellow-200'
        : 'bg-green-50 border-green-200';

  return (
    <div className={`rounded-lg p-4 border ${tone}`}>
      <div className="flex items-center gap-2 mb-1">
        {!done ? (
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        ) : job.sent > 0 && job.failed === 0 ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <AlertCircle className={`h-5 w-5 ${job.sent === 0 ? 'text-red-600' : 'text-yellow-600'}`} />
        )}
        <span className="font-medium">
          {!done
            ? `Sending "${job.subject}"… ${processed} of ${job.total}`
            : job.sent === 0
              ? `"${job.subject}" failed to send`
              : `"${job.subject}" sent to ${job.sent} of ${job.total} recipients`}
        </span>
      </div>
      <p className="text-sm text-gray-600 ml-7">
        {!done
          ? 'You can leave or lock your phone — sending continues on the server.'
          : `Started ${minutesAgo(job.startedAt)}${job.failed > 0 ? `. ${job.failed} failed.` : '.'}`}
      </p>
      {job.errorMessage && (
        <p className="text-sm text-gray-700 ml-7 mt-1">{job.errorMessage}</p>
      )}
    </div>
  );
}

export function AdminEmailBlast() {
  const { selectedFacilityId } = useAppContext();

  const [members, setMembers] = useState<Member[]>([]);
  const [facilityName, setFacilityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [job, setJob] = useState<EmailBlastJob | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const jobInProgress = job?.status === 'sending';

  useEffect(() => {
    if (selectedFacilityId) {
      loadMembers();
      loadFacilityName();
      setJob(null);
      setSendError(null);
      loadLatestJob();
    }
  }, [selectedFacilityId]);

  // Poll while a blast is sending. A failed poll (phone asleep, network blip) just
  // tries again on the next tick — the send itself carries on server-side.
  useEffect(() => {
    if (!job || job.status !== 'sending') return;
    const timer = setInterval(async () => {
      const response = await adminApi.getEmailBlastJob(job.facilityId, job.jobId);
      const next = response.success ? response.data?.data?.job : null;
      if (!next) return;
      setJob(next);
      if (next.status === 'done') announceResult(next);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job?.jobId, job?.status]);

  // Show a blast that is still going (or just finished) when the page is reopened.
  const loadLatestJob = async () => {
    const response = await adminApi.getLatestEmailBlast(selectedFacilityId);
    const latest = response.success ? response.data?.data?.job : null;
    if (latest && (latest.status === 'sending' || isRecent(latest))) setJob(latest);
  };

  const loadFacilityName = async () => {
    try {
      const response = await facilitiesApi.getById(selectedFacilityId);
      if (response.success && response.facility) {
        setFacilityName(response.facility.name || response.facility.facilityName || '');
      }
    } catch {
      // Non-critical, preview will just show empty
    }
  };

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

    await startSend(false);
  };

  const startSend = async (allowDuplicate: boolean) => {
    try {
      setSending(true);
      setSendError(null);
      const response = await adminApi.sendEmailBlast(selectedFacilityId, {
        subject,
        message,
        recipientFilter,
        allowDuplicate,
      });

      // apiRequest wraps the backend payload in `data`, so the job is in response.data.data.
      const result = response.success ? response.data?.data : null;
      if (!result?.job) {
        // The request may have reached the server before the connection dropped,
        // so look for the blast before suggesting a resend.
        const latest = await adminApi.getLatestEmailBlast(selectedFacilityId);
        const latestJob = latest.success ? latest.data?.data?.job : null;
        if (latestJob && latestJob.subject === subject && isRecent(latestJob)) {
          setJob(latestJob);
          if (latestJob.status === 'done') announceResult(latestJob);
          return;
        }
        const errorMessage = response.error || 'Failed to send email blast';
        setSendError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setJob(result.job);
      if (result.duplicate) {
        if (result.job.status === 'sending') {
          toast.info('This email is already being sent.');
          return;
        }
        const resend = window.confirm(
          `This email already went out ${minutesAgo(result.job.startedAt)} ` +
            `(${result.job.sent} of ${result.job.total} delivered).\n\nSend it to everyone again?`
        );
        if (resend) await startSend(true);
        return;
      }
      if (result.job.status === 'done') announceResult(result.job);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setSubject('');
    setMessage('');
    setRecipientFilter('all');
    setJob(null);
    setSendError(null);
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
                    <h3 className="text-white font-semibold text-lg">{facilityName || 'Your Facility'}</h3>
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

          {/* Send Progress / Result */}
          {sendError && !job && (
            <div className="rounded-lg p-4 bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium">{sendError}</span>
              </div>
            </div>
          )}
          {job && <EmailBlastStatusPanel job={job} />}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSend}
              disabled={sending || jobInProgress || !subject.trim() || !message.trim() || filteredRecipients.length === 0}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {sending || jobInProgress ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending || jobInProgress
                ? 'Sending...'
                : `Send to ${filteredRecipients.length} Recipient${filteredRecipients.length !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={sending || jobInProgress}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
