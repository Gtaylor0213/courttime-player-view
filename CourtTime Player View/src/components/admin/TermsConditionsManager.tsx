import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../api/client';
import type { TermsAttachment } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const MAX_TERMS_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

interface TermsVersion {
  id: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  attachments: TermsAttachment[];
  requiredReviewSeconds: number;
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
  const [attachments, setAttachments] = useState<TermsAttachment[]>([]);
  const [requiredReviewSeconds, setRequiredReviewSeconds] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<TermsVersion | null>(null);
  const [accepted, setAccepted] = useState<AcceptanceMember[]>([]);
  const [notAccepted, setNotAccepted] = useState<AcceptanceMember[]>([]);

  const sanitizedPreview = useMemo(() => DOMPurify.sanitize(contentHtml || ''), [contentHtml]);

  const loadData = async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    try {
      const [termsResponse, summaryResponse] = await Promise.all([
        adminApi.getTerms(selectedFacilityId),
        adminApi.getTermsAcceptanceSummary(selectedFacilityId),
      ]);

      if (termsResponse.success && termsResponse.data?.data) {
        const current = termsResponse.data.data.currentVersion || null;
        setCurrentVersion(current);
        setContentHtml(current?.contentHtml || '');
        setAttachments(current?.attachments || []);
        setRequiredReviewSeconds(current?.requiredReviewSeconds || 0);
      } else {
        setCurrentVersion(null);
        setContentHtml('');
        setAttachments([]);
        setRequiredReviewSeconds(0);
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

    const normalizedRequiredReviewSeconds = Number.isFinite(requiredReviewSeconds)
      ? Math.max(0, Math.floor(requiredReviewSeconds))
      : 0;

    try {
      setSaving(true);
      const response = await adminApi.publishTerms(
        selectedFacilityId,
        contentHtml,
        normalizedRequiredReviewSeconds,
        attachments
      );
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

  const readFileAsDataUrl = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    })
  );

  const handleAttachmentsChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    if (!files.length) return;

    const validFiles = files.filter((file) => {
      if (file.type !== 'application/pdf') {
        toast.error(`${file.name} is not a PDF`);
        return false;
      }
      if (file.size > MAX_TERMS_ATTACHMENT_SIZE_BYTES) {
        toast.error(`${file.name} must be smaller than 10MB`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    try {
      const newAttachments = await Promise.all(
        validFiles.map(async (file, index) => ({
          id: `terms-${Date.now()}-${index}`,
          fileName: file.name,
          mimeType: file.type,
          dataUrl: await readFileAsDataUrl(file),
        }))
      );
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (error) {
      console.error('Failed to read terms attachments:', error);
      toast.error('Failed to read one or more PDF attachments');
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
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
            Publish versioned Terms & Conditions for this facility. Publishing a new version requires all active members to accept again.
          </p>
          {currentVersion && (
            <p className="text-xs text-gray-500">
              Current version: {currentVersion.versionNumber} (published {new Date(currentVersion.publishedAt).toLocaleString()})
              {currentVersion.requiredReviewSeconds > 0 ? ` · ${currentVersion.requiredReviewSeconds}s required review` : ''}
              {currentVersion.attachments.length > 0 ? ` · ${currentVersion.attachments.length} PDF attachment${currentVersion.attachments.length === 1 ? '' : 's'}` : ''}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="terms-html">Terms Content (HTML)</Label>
            <textarea
              id="terms-html"
              className="flex min-h-[240px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={contentHtml}
              onChange={(e) => setContentHtml(e.target.value)}
              placeholder="<h2>Terms & Conditions</h2><p>...</p>"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="required-review-seconds">Required Review Time (Seconds)</Label>
            <Input
              id="required-review-seconds"
              type="number"
              min="0"
              value={requiredReviewSeconds}
              onChange={(e) => setRequiredReviewSeconds(Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
            />
            <p className="text-xs text-gray-500">
              Optional. Players must wait this long before they can accept the published terms. Set to 0 to disable the timer.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms-pdf-attachments">PDF Attachments</Label>
            <Input
              id="terms-pdf-attachments"
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleAttachmentsChange}
            />
            <p className="text-xs text-gray-500">
              Optional. Uploaded PDFs are attached to this published terms version and shown as downloads to players.
            </p>
            {attachments.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between gap-3 text-sm">
                    <a
                      href={attachment.dataUrl}
                      download={attachment.fileName}
                      className="truncate text-blue-600 hover:underline"
                    >
                      {attachment.fileName}
                    </a>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAttachment(attachment.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="rounded-md border bg-white p-4 max-h-[320px] overflow-y-auto">
              {contentHtml.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizedPreview }} />
              ) : (
                <p className="text-sm text-gray-500">No content yet.</p>
              )}
              {attachments.length > 0 && (
                <div className="mt-4 border-t pt-4 space-y-2">
                  <p className="text-sm font-medium">PDF Attachments</p>
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.dataUrl}
                      download={attachment.fileName}
                      className="block text-sm text-blue-600 hover:underline"
                    >
                      {attachment.fileName}
                    </a>
                  ))}
                </div>
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
