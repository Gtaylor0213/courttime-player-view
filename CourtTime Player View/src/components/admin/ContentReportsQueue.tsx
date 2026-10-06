import { useCallback, useEffect, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export interface ContentReport {
  id: string;
  contentType: 'message' | 'bulletin_post' | 'hitting_partner_post' | 'user';
  reason: string;
  details: string | null;
  contentSnapshot: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  facilityName: string | null;
  reporterName: string | null;
  reportedUserName: string | null;
}

type Result<T> = { success: boolean; data?: T; error?: string };

interface ContentReportsQueueProps {
  description: string;
  /** The CourtTime team's queue spans clubs, so each row names its club. */
  showFacility?: boolean;
  load: (status: 'open' | 'closed') => Promise<Result<ContentReport[]>>;
  resolve: (reportId: string, action: 'remove' | 'dismiss') => Promise<Result<unknown>>;
}

const TYPE_LABELS: Record<ContentReport['contentType'], string> = {
  message: 'Message',
  bulletin_post: 'Bulletin post',
  hitting_partner_post: 'Hitting partner post',
  user: 'Member',
};

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or bullying',
  inappropriate: 'Offensive or inappropriate',
  spam: 'Spam or scam',
  other: 'Something else',
};

/**
 * Review queue for member reports of offensive content (App Store Guideline
 * 1.2 expects reports to be acted on promptly). Shared by the club admin page
 * and the CourtTime team's console, which differ only in what they can see.
 */
export function ContentReportsQueue({ description, showFacility, load, resolve }: ContentReportsQueueProps) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const response = await load(status);
    setLoading(false);
    if (!response.success) {
      toast.error(response.error || 'Failed to load reports');
      return;
    }
    setReports(response.data ?? []);
  }, [load, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (report: ContentReport, action: 'remove' | 'dismiss') => {
    const isMember = report.contentType === 'user';
    if (
      action === 'remove' &&
      !isMember &&
      !window.confirm(`Remove this ${TYPE_LABELS[report.contentType].toLowerCase()}? This can't be undone.`)
    ) {
      return;
    }
    setBusyId(report.id);
    const response = await resolve(report.id, action);
    setBusyId(null);
    if (!response.success) {
      toast.error(response.error || 'Could not update report');
      return;
    }
    toast.success(action === 'dismiss' ? 'Report dismissed' : isMember ? 'Report marked handled' : 'Content removed');
    void refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Flag className="h-6 w-6 text-red-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Content Reports</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={status === 'open' ? 'default' : 'outline'} size="sm" onClick={() => setStatus('open')}>
            Open
          </Button>
          <Button variant={status === 'closed' ? 'default' : 'outline'} size="sm" onClick={() => setStatus('closed')}>
            Closed
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            {status === 'open' ? 'No open reports. Nothing needs your attention.' : 'No closed reports yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{TYPE_LABELS[report.contentType]}</Badge>
                  <Badge className="bg-red-100 text-red-700">{REASON_LABELS[report.reason] ?? report.reason}</Badge>
                  {report.status !== 'open' && (
                    <Badge variant="secondary">{report.status === 'resolved' ? 'Handled' : 'Dismissed'}</Badge>
                  )}
                  <span className="text-xs text-gray-500 ml-auto">
                    {new Date(report.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>

                <p className="text-sm text-gray-700">
                  <span className="font-medium">{report.reportedUserName || 'A member'}</span> was reported by{' '}
                  <span className="font-medium">{report.reporterName || 'a member'}</span>
                  {showFacility && report.facilityName ? ` at ${report.facilityName}` : ''}.
                </p>

                {report.contentSnapshot && (
                  <blockquote className="rounded-md bg-gray-50 border border-gray-200 p-3 text-sm text-gray-900 whitespace-pre-wrap break-words">
                    {report.contentSnapshot}
                  </blockquote>
                )}
                {report.details && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Reporter's note:</span> {report.details}
                  </p>
                )}

                {report.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => act(report, 'remove')}
                      disabled={busyId !== null}
                    >
                      {report.contentType === 'user' ? 'Mark handled' : 'Remove content'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(report, 'dismiss')}
                      disabled={busyId !== null}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
