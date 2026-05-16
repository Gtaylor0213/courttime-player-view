import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { membersApi, unwrapApiPayload } from '../api/client';

/**
 * Return URL after Stripe lockout checkout. Confirms payment with Stripe, then restores app access.
 */
export function LockoutPaid() {
  const [searchParams] = useSearchParams();
  const facilityId = searchParams.get('facilityId');
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'confirming' | 'unlocked' | 'waiting'>('confirming');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!facilityId) {
      setStatus('waiting');
      setError('Missing facility information from payment return URL.');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finishUnlocked = () => {
      if (cancelled) return;
      setStatus('unlocked');
      window.dispatchEvent(new CustomEvent('payment-unlocked'));
      timer = setTimeout(() => {
        window.location.replace('/calendar');
      }, 1500);
    };

    const pollLockoutCleared = async () => {
      attempts += 1;
      try {
        const res = await membersApi.getLockoutInfo(facilityId);
        const info = unwrapApiPayload<{ isLocked?: boolean }>(res.data) ?? (res.data as { isLocked?: boolean });
        if (!cancelled && res.success && info?.isLocked === false) {
          finishUnlocked();
          return;
        }
      } catch {
        // Retry
      }
      if (!cancelled && attempts < 12) {
        setStatus('waiting');
        timer = setTimeout(pollLockoutCleared, 1500);
      } else if (!cancelled) {
        setError('Payment is still processing. Try refreshing in a moment.');
        setStatus('waiting');
      }
    };

    const confirmPayment = async () => {
      if (sessionId) {
        try {
          const res = await membersApi.confirmLockoutPayment(facilityId, sessionId);
          const payload = unwrapApiPayload<{ unlocked?: boolean }>(res.data) ?? (res.data as { unlocked?: boolean });
          if (!cancelled && res.success && payload?.unlocked) {
            finishUnlocked();
            return;
          }
          if (!cancelled && res.success) {
            await pollLockoutCleared();
            return;
          }
          if (!cancelled && !res.success) {
            setError(res.error || 'Could not confirm payment yet.');
          }
        } catch {
          if (!cancelled) setError('Could not confirm payment yet.');
        }
      }
      if (!cancelled) {
        setStatus('waiting');
        await pollLockoutCleared();
      }
    };

    void confirmPayment();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [facilityId, sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {status === 'unlocked' ? (
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              ) : (
                <Clock className="h-7 w-7 text-yellow-600" />
              )}
              <div>
                <CardTitle>
                  {status === 'unlocked'
                    ? 'Access restored'
                    : status === 'confirming'
                      ? 'Confirming your payment…'
                      : 'Processing your payment…'}
                </CardTitle>
                <CardDescription>
                  {status === 'unlocked'
                    ? 'Redirecting you to the court calendar…'
                    : 'Your payment was received. Unlocking your account now.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}
            {status !== 'unlocked' && (
              <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
                Refresh status
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
