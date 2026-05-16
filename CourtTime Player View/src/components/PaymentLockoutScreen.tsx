import React, { useEffect, useState } from 'react';
import { Lock, ExternalLink } from 'lucide-react';
import { membersApi } from '../api/client';

interface LockoutInfo {
  facilityId?: string;
  facilityName?: string;
  lockedAt?: string;
}

interface PaymentLockoutScreenProps {
  lockout: LockoutInfo;
}

export function PaymentLockoutScreen({ lockout }: PaymentLockoutScreenProps) {
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!lockout.facilityId) return;
    setLoadingInfo(true);
    membersApi.getLockoutInfo(lockout.facilityId).then((res) => {
      if (res.success && res.data) {
        const d = (res.data as any).data ?? res.data;
        setAmountCents(d.amountCents ?? null);
        setDescription(d.description ?? null);
      }
    }).finally(() => setLoadingInfo(false));
  }, [lockout.facilityId]);

  const handlePayNow = async () => {
    if (!lockout.facilityId) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const res = await membersApi.getLockoutCheckoutUrl(lockout.facilityId);
      const url = (res as any).data?.checkoutUrl ?? (res as any).checkoutUrl;
      if (res.success && url) {
        window.location.href = url;
      } else {
        setCheckoutError((res as any).error || 'Could not generate payment link. Contact your facility administrator.');
      }
    } catch {
      setCheckoutError('Could not generate payment link. Contact your facility administrator.');
    } finally {
      setCheckingOut(false);
    }
  };

  const hasPayment = amountCents !== null && amountCents > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 p-4">
            <Lock className="h-10 w-10 text-red-600" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Account Payment Required</h1>
          {lockout.facilityName && (
            <p className="text-gray-600">
              Your membership at <span className="font-medium">{lockout.facilityName}</span> has been
              locked pending payment.
            </p>
          )}
          {loadingInfo ? (
            <div className="flex justify-center py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" />
            </div>
          ) : hasPayment ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
              <p className="text-2xl font-bold text-red-700">
                ${(amountCents / 100).toFixed(2)}
              </p>
              {description && (
                <p className="text-sm text-red-600">{description}</p>
              )}
            </div>
          ) : (
            <p className="text-gray-600">
              Please contact your facility administrator to resolve your account balance and restore access.
            </p>
          )}
          {lockout.lockedAt && (
            <p className="text-sm text-gray-400">
              Locked on {new Date(lockout.lockedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {checkoutError && (
          <p className="text-sm text-red-600">{checkoutError}</p>
        )}

        <div className="flex flex-col items-center gap-3">
          {hasPayment && (
            <button
              onClick={handlePayNow}
              disabled={checkingOut}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              {checkingOut ? 'Preparing payment…' : 'Pay Now to Restore Access'}
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-green-600 hover:text-green-700 underline"
          >
            Already paid? Refresh page
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Your account will be automatically restored once payment is confirmed.
        </p>
      </div>
    </div>
  );
}
