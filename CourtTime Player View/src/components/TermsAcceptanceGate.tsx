import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

export function TermsAcceptanceGate() {
  const { pendingTermsAcceptances, acceptTermsAndContinue } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const termsScrollRef = useRef<HTMLDivElement>(null);

  const current = pendingTermsAcceptances[0];
  const sanitizedHtml = useMemo(
    () => (current?.contentHtml ? DOMPurify.sanitize(current.contentHtml) : ''),
    [current?.contentHtml]
  );

  // Reset + detect "no scroll needed" in one layout pass. A separate useEffect(false) after this
  // would undo short-content acceptance (React runs all useLayoutEffect before useEffect).
  useLayoutEffect(() => {
    setAgreed(false);
    if (!current) {
      setScrolledToBottom(false);
      return;
    }
    const el = termsScrollRef.current;
    if (!el) {
      setScrolledToBottom(false);
      return;
    }
    el.scrollTop = 0;
    setScrolledToBottom(el.scrollHeight <= el.clientHeight + 8);
  }, [sanitizedHtml, current?.facilityId, current?.currentVersionNumber]);

  const handleScrollTerms = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const reachedBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (reachedBottom) setScrolledToBottom(true);
  };

  const handleAccept = async () => {
    if (!current) return;
    if (!agreed || submitting || !scrolledToBottom) return;
    setSubmitting(true);
    const ok = await acceptTermsAndContinue(current.facilityId);
    if (ok) setAgreed(false);
    setSubmitting(false);
  };

  if (!current) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms & Conditions Update Required</CardTitle>
            <p className="text-sm text-gray-600">
              You must accept the latest Terms & Conditions for <strong>{current.facilityName}</strong> before you can book a court or continue using the club.
            </p>
            <p className="text-xs text-gray-500">
              Version {current.currentVersionNumber} published on {new Date(current.publishedAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              ref={termsScrollRef}
              className="max-h-[55vh] overflow-y-auto rounded-md border bg-white p-4"
              onScroll={handleScrollTerms}
            >
              <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            </div>

            {!scrolledToBottom && (
              <p className="text-xs text-gray-500">
                Scroll to the bottom of the terms to enable acceptance.
              </p>
            )}

            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms-agree"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(Boolean(checked))}
                disabled={!scrolledToBottom}
              />
              <label htmlFor="terms-agree" className="text-sm leading-5">
                I have read and agree to the Terms & Conditions
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAccept} disabled={!agreed || submitting || !scrolledToBottom}>
                {submitting ? 'Accepting...' : 'Accept & Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
