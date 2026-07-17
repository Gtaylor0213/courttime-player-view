import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';

interface TermsVersion {
  id: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
}

interface AcceptanceMember {
  userId: string;
  fullName: string;
  email: string;
  acceptedAt?: string;
}

export function TermsConditionsManager() {
  const { selectedFacilityId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contentHtml, setContentHtml] = useState('');
  const [currentVersion, setCurrentVersion] = useState<TermsVersion | null>(null);
  const [accepted, setAccepted] = useState<AcceptanceMember[]>([]);
  const [notAccepted, setNotAccepted] = useState<AcceptanceMember[]>([]);

  const sanitizedPreview = useMemo(() => DOMPurify.sanitize(contentHtml || ''), [contentHtml]);
  // Plain-text content relies on literal newlines for spacing; HTML content manages its own.
  const isPlainText = useMemo(() => !/<\/?[a-z][^>]*>/i.test(contentHtml || ''), [contentHtml]);

  const loadData = async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    try {
      const [termsResponse, summaryResponse] = await Promise.all([
        adminApi.getTerms(selectedFacilityId),
        adminApi.getTermsAcceptanceSummary(selectedFacilityId),
      ]);

      if (termsResponse.success && termsResponse.data?.data) {
        const raw = termsResponse.data.data.currentVersion;
        const current = raw
          ? {
              id: raw.id,
              facilityId: raw.facilityId,
              versionNumber: raw.versionNumber,
              contentHtml: raw.contentHtml || '',
              publishedAt: raw.publishedAt,
            }
          : null;
        setCurrentVersion(current);
        setContentHtml(current?.contentHtml || '');
      } else {
        setCurrentVersion(null);
        setContentHtml('');
      }

      if (summaryResponse.success && summaryResponse.data?.data) {
        setAccepted(summaryResponse.data.data.accepted || []);
        setNotAccepted(summaryResponse.data.data.notAccepted || []);
      } else {
        setAccepted([]);
        setNotAccepted([]);
      }
    } catch (error) {
      console.error('Failed to load terms data:', error);
      toast.error('Failed to load Terms & Conditions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFacilityId]);

  const handlePublish = async () => {
    if (!selectedFacilityId) return;
    if (!contentHtml.trim()) {
      toast.error('Terms & Conditions content cannot be empty');
      return;
    }

    try {
      setSaving(true);
      const response = await adminApi.publishTerms(selectedFacilityId, contentHtml, 0, []);
      if (!response.success) {
        toast.error(response.error || 'Failed to publish Terms & Conditions');
        return;
      }

      toast.success('Terms & Conditions published. Members now need to re-accept.');
      await loadData();
    } catch (error) {
      console.error('Failed to publish terms:', error);
      toast.error('Failed to publish Terms & Conditions');
    } finally {
      setSaving(false);
    }
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
      <Card>
        <CardHeader>
          <CardTitle>Terms & Conditions</CardTitle>
          <p className="text-sm text-gray-600">
            Publish versioned Terms & Conditions for this facility by pasting content below. Publishing a new version requires all active members to accept again. Members must scroll through the full text before they can accept.
          </p>
          {currentVersion && (
            <p className="text-xs text-gray-500">
              Current version: {currentVersion.versionNumber} (published {new Date(currentVersion.publishedAt).toLocaleString()})
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="terms-html">Terms content (paste text or HTML)</Label>
            <textarea
              id="terms-html"
              className="flex min-h-[240px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={contentHtml}
              onChange={(e) => setContentHtml(e.target.value)}
              placeholder="Paste your Terms & Conditions (plain text or HTML)..."
            />
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="rounded-md border bg-white p-4 max-h-[320px] overflow-y-auto">
              {contentHtml.trim() ? (
                <div
                  className={isPlainText ? 'whitespace-pre-wrap' : undefined}
                  dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
                />
              ) : (
                <p className="text-sm text-gray-500">No content yet.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handlePublish} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Publishing...' : 'Publish New Version'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accepted Current Version ({accepted.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] overflow-auto divide-y">
              {accepted.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">No members have accepted yet.</p>
              ) : accepted.map((member) => (
                <div key={member.userId} className="py-2">
                  <p className="text-sm font-medium">{member.fullName}</p>
                  <p className="text-xs text-gray-600">{member.email}</p>
                  {member.acceptedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Accepted: {new Date(member.acceptedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Not Yet Accepted ({notAccepted.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] overflow-auto divide-y">
              {notAccepted.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">All active members have accepted.</p>
              ) : notAccepted.map((member) => (
                <div key={member.userId} className="py-2">
                  <p className="text-sm font-medium">{member.fullName}</p>
                  <p className="text-xs text-gray-600">{member.email}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
