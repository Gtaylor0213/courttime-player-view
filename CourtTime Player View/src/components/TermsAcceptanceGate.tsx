import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

export function TermsAcceptanceGate() {
  const { pendingTermsAcceptances, acceptTermsAndContinue } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewSecondsRemaining, setReviewSecondsRemaining] = useState(0);

  const current = pendingTermsAcceptances[0];
  const sanitizedHtml = useMemo(
    () => (current?.contentHtml ? DOMPurify.sanitize(current.contentHtml) : ''),
    [current?.contentHtml]
  );

  useEffect(() => {
    setAgreed(false);
    setReviewSecondsRemaining(Math.max(0, Number(current?.requiredReviewSeconds) || 0));
  }, [current?.facilityId, current?.currentVersionNumber, current?.requiredReviewSeconds]);

  useEffect(() => {
    if (reviewSecondsRemaining <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setReviewSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [reviewSecondsRemaining]);

  if (!current) return null;

  const handleAccept = async () => {
    if (!agreed || submitting || reviewSecondsRemaining > 0) return;
    setSubmitting(true);
    const ok = await acceptTermsAndContinue(current.facilityId);
    if (ok) setAgreed(false);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms & Conditions Update Required</CardTitle>
            <p className="text-sm text-gray-600">
              You must accept the latest Terms & Conditions for <strong>{current.facilityName}</strong> to continue.
            </p>
            <p className="text-xs text-gray-500">
              Version {current.currentVersionNumber} published on {new Date(current.publishedAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-white p-4">
              <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            </div>

            {current.attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">PDF Attachments</p>
                <div className="rounded-md border p-3 space-y-2">
                  {current.attachments.map((attachment) => (
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
              </div>
            )}

            {reviewSecondsRemaining > 0 && (
              <p className="text-xs text-gray-500">
                Review time remaining: {reviewSecondsRemaining} second{reviewSecondsRemaining === 1 ? '' : 's'}.
              </p>
            )}

            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms-agree"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(Boolean(checked))}
                disabled={reviewSecondsRemaining > 0}
              />
              <label htmlFor="terms-agree" className="text-sm leading-5">
                I have read and agree to the Terms & Conditions
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAccept} disabled={!agreed || submitting || reviewSecondsRemaining > 0}>
                {submitting ? 'Accepting...' : 'Accept & Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
