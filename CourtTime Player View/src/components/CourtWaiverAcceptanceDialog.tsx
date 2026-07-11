import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { bookingApi } from '../api/client';

export interface PendingCourtWaiver {
  courtId: string;
  courtName: string;
  facilityId: string;
  waiverVersionId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
}

/**
 * Gate a booking action behind per-court waiver acceptance.
 *
 * const waiverGate = useCourtWaiverGate();
 * ...
 * if (!(await waiverGate.ensureAccepted(courtIds))) return; // user declined
 * ...
 * <CourtWaiverAcceptanceDialog {...waiverGate.dialogProps} />
 */
export function useCourtWaiverGate() {
  const [pendingWaivers, setPendingWaivers] = useState<PendingCourtWaiver[]>([]);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const finish = useCallback((accepted: boolean) => {
    setPendingWaivers([]);
    resolverRef.current?.(accepted);
    resolverRef.current = null;
  }, []);

  const ensureAccepted = useCallback(async (courtIds: string[]): Promise<boolean> => {
    const uniqueIds = [...new Set(courtIds.filter(Boolean))];
    if (uniqueIds.length === 0) return true;

    let waivers: PendingCourtWaiver[] = [];
    try {
      const res = await bookingApi.getPendingCourtWaivers(uniqueIds);
      if (res.success) {
        const payload = (res.data as any)?.data ?? res.data;
        waivers = (payload?.pending ?? []) as PendingCourtWaiver[];
      }
    } catch (error) {
      // If the check fails, let the booking attempt proceed — the server
      // still blocks unaccepted waivers and returns a clear error.
      console.error('Failed to check court waivers:', error);
      return true;
    }

    if (waivers.length === 0) return true;

    setPendingWaivers(waivers);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleAccepted = useCallback((courtId: string) => {
    setPendingWaivers((prev) => {
      const remaining = prev.filter((w) => w.courtId !== courtId);
      if (remaining.length === 0) {
        resolverRef.current?.(true);
        resolverRef.current = null;
      }
      return remaining;
    });
  }, []);

  const handleDeclined = useCallback(() => {
    finish(false);
  }, [finish]);

  return {
    ensureAccepted,
    dialogProps: {
      pendingWaivers,
      onAccepted: handleAccepted,
      onDeclined: handleDeclined,
    },
  };
}

export function CourtWaiverAcceptanceDialog({
  pendingWaivers,
  onAccepted,
  onDeclined,
}: {
  pendingWaivers: PendingCourtWaiver[];
  onAccepted: (courtId: string) => void;
  onDeclined: () => void;
}) {
  const current = pendingWaivers[0];
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sanitizedHtml = useMemo(
    () => (current?.contentHtml ? DOMPurify.sanitize(current.contentHtml) : ''),
    [current?.contentHtml]
  );

  // Reset + detect "no scroll needed" in one layout pass (same pattern as
  // TermsAcceptanceGate — a separate useEffect(false) would undo short-content
  // acceptance).
  useLayoutEffect(() => {
    setAgreed(false);
    setError(null);
    if (!current) {
      setScrolledToBottom(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      setScrolledToBottom(false);
      return;
    }
    el.scrollTop = 0;
    setScrolledToBottom(el.scrollHeight <= el.clientHeight + 8);
  }, [sanitizedHtml, current?.courtId, current?.versionNumber]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToBottom(true);
  };

  const handleAccept = async () => {
    if (!current || !agreed || submitting || !scrolledToBottom) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await bookingApi.acceptCourtWaiver(current.courtId);
      if (res.success) {
        onAccepted(current.courtId);
      } else {
        setError(res.error || 'Failed to record waiver acceptance');
      }
    } catch (err) {
      console.error('Failed to accept court waiver:', err);
      setError('Failed to record waiver acceptance');
    } finally {
      setSubmitting(false);
    }
  };

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onDeclined(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Waiver Required — {current.courtName}</DialogTitle>
          <DialogDescription>
            This court requires you to accept a waiver before booking.
            {pendingWaivers.length > 1 && ` (${pendingWaivers.length} waivers to review)`}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="max-h-[45vh] overflow-y-auto rounded-md border bg-white p-4"
          onScroll={handleScroll}
        >
          <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
        </div>

        {!scrolledToBottom && (
          <p className="text-xs text-gray-500">
            Scroll to the bottom of the waiver to enable acceptance.
          </p>
        )}

        <div className="flex items-start space-x-3">
          <Checkbox
            id={`court-waiver-agree-${current.courtId}`}
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(Boolean(checked))}
            disabled={!scrolledToBottom}
          />
          <label htmlFor={`court-waiver-agree-${current.courtId}`} className="text-sm leading-5">
            I have read and agree to the waiver for {current.courtName}
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onDeclined} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={!agreed || submitting || !scrolledToBottom}>
            {submitting ? 'Accepting...' : 'Accept & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
