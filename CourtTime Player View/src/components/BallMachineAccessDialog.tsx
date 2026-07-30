import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { KeyRound, Loader2 } from 'lucide-react';
import { ballMachineApi } from '../api/client';

interface BallMachineAccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId: string;
  /** Shown under the code so the member knows which reservation this is for. */
  bookingSummary?: string;
}

interface AccessCodeData {
  accessCode: string;
  instructions: string | null;
  activePass: { expiresAt: string; durationMonths: number } | null;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Shown right after a member adds the ball machine to a booking — whether they just
 * paid the hourly rate or their St. Marlow pass covered it. The code is fetched on
 * open rather than passed in, so it always reflects the club's current keypad code.
 */
export function BallMachineAccessDialog({
  isOpen,
  onClose,
  facilityId,
  bookingSummary,
}: BallMachineAccessDialogProps) {
  const [data, setData] = useState<AccessCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !facilityId) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setData(null);

    ballMachineApi
      .getAccessCode(facilityId)
      .then((res: any) => {
        if (cancelled) return;
        if (res.success && res.data?.accessCode) {
          setData(res.data);
        } else {
          setError(
            res.error || 'The club has not set an access code yet. Please ask the front desk.'
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the ball machine code.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, facilityId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-green-700" />
            Ball machine access
          </DialogTitle>
          <DialogDescription>
            {bookingSummary || 'Use this code on the ball machine keypad.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {!isLoading && data && (
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-green-200 bg-green-50 px-4 py-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-green-800">Keypad code</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-green-900">
                {data.accessCode}
              </p>
            </div>

            {data.activePass ? (
              <p className="text-sm text-gray-600">
                Covered by your pass — unlimited use through{' '}
                <span className="font-medium text-gray-900">{formatExpiry(data.activePass.expiresAt)}</span>.
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                Charged at your club's hourly ball machine rate for this reservation.
              </p>
            )}

            {data.instructions && (
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                {data.instructions}
              </div>
            )}

            <p className="text-xs text-gray-500">
              The code can change — reopen this from your reservation any time.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
