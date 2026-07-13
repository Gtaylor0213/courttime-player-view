import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { FileText, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { FEATURE_FLAGS } from '../../../shared/constants/featureFlags';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

interface CourtWaiverVersion {
  id: string;
  courtId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
}

/**
 * Per-court waiver editor used in the court add/edit forms.
 *
 * - Existing court (courtId set): loads, publishes, and removes the waiver
 *   directly against the API.
 * - New court (courtId null): holds a draft via draftContent/onDraftChange;
 *   the caller publishes it after the court is created.
 */
export function CourtWaiverSection({
  courtId,
  idPrefix,
  draftContent,
  onDraftChange,
}: {
  courtId: string | null;
  idPrefix: string;
  draftContent?: string;
  onDraftChange?: (content: string) => void;
}) {
  const { enabledFeatures } = useAppContext();
  const featureEnabled = enabledFeatures.includes(FEATURE_FLAGS.COURT_WAIVERS);
  const isDraftMode = !courtId;
  const [enabled, setEnabled] = useState(isDraftMode ? Boolean(draftContent?.trim()) : false);
  const [loading, setLoading] = useState(!isDraftMode);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState(draftContent || '');
  const [currentVersion, setCurrentVersion] = useState<CourtWaiverVersion | null>(null);
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);
  const [notAcceptedCount, setNotAcceptedCount] = useState<number | null>(null);

  const sanitizedPreview = useMemo(() => DOMPurify.sanitize(content || ''), [content]);

  useEffect(() => {
    if (isDraftMode || !featureEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [waiverRes, summaryRes] = await Promise.all([
          adminApi.getCourtWaiver(courtId),
          adminApi.getCourtWaiverAcceptanceSummary(courtId),
        ]);
        if (cancelled) return;

        const waiver = (waiverRes.data as any)?.data?.currentVersion ?? null;
        setCurrentVersion(waiver);
        setContent(waiver?.contentHtml || '');
        setEnabled(Boolean(waiver));

        const summary = (summaryRes.data as any)?.data;
        setAcceptedCount(summary?.accepted?.length ?? null);
        setNotAcceptedCount(summary?.notAccepted?.length ?? null);
      } catch (error) {
        console.error('Failed to load court waiver:', error);
        if (!cancelled) toast.error('Failed to load court waiver');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courtId, isDraftMode, featureEnabled]);

  const handleContentChange = (value: string) => {
    setContent(value);
    if (isDraftMode) onDraftChange?.(value);
  };

  const handleToggle = (checked: boolean) => {
    if (isDraftMode) {
      setEnabled(checked);
      onDraftChange?.(checked ? content : '');
      return;
    }
    if (!checked && currentVersion) {
      // Turning off an active waiver removes it (confirmed inside handleRemove)
      void handleRemove();
      return;
    }
    setEnabled(checked);
  };

  const handlePublish = async () => {
    if (!courtId) return;
    if (!content.trim()) {
      toast.error('Waiver content cannot be empty');
      return;
    }
    try {
      setSaving(true);
      const res = await adminApi.publishCourtWaiver(courtId, content);
      if (!res.success) {
        toast.error(res.error || 'Failed to publish waiver');
        return;
      }
      const version = (res.data as any)?.data?.version ?? null;
      setCurrentVersion(version);
      setAcceptedCount(0);
      toast.success('Waiver published. Members must accept it each time they book this court.');
    } catch (error) {
      console.error('Failed to publish court waiver:', error);
      toast.error('Failed to publish waiver');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!courtId || !currentVersion) return;
    if (!confirm('Remove the waiver from this court? Members will no longer be asked to accept it when booking.')) {
      return;
    }
    try {
      setSaving(true);
      const res = await adminApi.removeCourtWaiver(courtId);
      if (!res.success) {
        toast.error(res.error || 'Failed to remove waiver');
        return;
      }
      setCurrentVersion(null);
      setContent('');
      setEnabled(false);
      setAcceptedCount(null);
      setNotAcceptedCount(null);
      toast.success('Waiver removed from this court');
    } catch (error) {
      console.error('Failed to remove court waiver:', error);
      toast.error('Failed to remove waiver');
    } finally {
      setSaving(false);
    }
  };

  if (!featureEnabled) return null;

  return (
    <div className="mt-4 p-4 border rounded-lg bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-600" />
          <Label htmlFor={`${idPrefix}-waiver-toggle`} className="font-medium">
            Court Waiver
          </Label>
        </div>
        <Switch
          id={`${idPrefix}-waiver-toggle`}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={loading || saving}
        />
      </div>
      <p className="text-xs text-gray-500">
        Attach a waiver to this court. Members must read and accept it every time they book
        this court — useful for custom or paid courts with special conditions.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading waiver…
        </div>
      ) : enabled ? (
        <div className="space-y-3">
          {currentVersion && (
            <p className="text-xs text-gray-500">
              Current version: {currentVersion.versionNumber} (published{' '}
              {new Date(currentVersion.publishedAt).toLocaleString()})
              {acceptedCount != null && notAcceptedCount != null && (
                <> · {acceptedCount} members have accepted, {notAcceptedCount} have not</>
              )}
            </p>
          )}
          <textarea
            id={`${idPrefix}-waiver-content`}
            className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Paste your waiver text (plain text or HTML)..."
          />
          {content.trim() && (
            <div className="rounded-md border bg-gray-50 p-3 max-h-[160px] overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
              <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizedPreview }} />
            </div>
          )}
          {isDraftMode ? (
            <p className="text-xs text-gray-500">
              The waiver is published when the court is saved.
            </p>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handlePublish} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {currentVersion ? 'Publish New Version' : 'Publish Waiver'}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
