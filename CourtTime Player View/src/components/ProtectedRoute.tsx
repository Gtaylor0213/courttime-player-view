import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { membersApi } from '../api/client';
import { TermsAcceptanceGate } from './TermsAcceptanceGate';
import { PaymentLockoutScreen } from './PaymentLockoutScreen';

export interface PaymentLockoutInfo {
  facilityId?: string;
  facilityName?: string;
  lockedAt?: string;
  amountCents?: number | null;
  description?: string | null;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function normalizeLockoutPayload(raw: unknown): PaymentLockoutInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lockout = (record.lockout ?? record) as Record<string, unknown>;
  if (!lockout.facilityId && !lockout.facilityName) return null;
  return {
    facilityId: lockout.facilityId as string | undefined,
    facilityName: lockout.facilityName as string | undefined,
    lockedAt: lockout.lockedAt as string | undefined,
    amountCents: (lockout.amountCents as number | null | undefined) ?? null,
    description: (lockout.description as string | null | undefined) ?? null,
  };
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, termsLoading, pendingTermsAcceptances } = useAuth();
  const location = useLocation();
  const [lockoutInfo, setLockoutInfo] = useState<PaymentLockoutInfo | null>(null);
  const [lockoutChecking, setLockoutChecking] = useState(false);
  const isLockoutPaidPage = location.pathname === '/lockout-paid';

  useEffect(() => {
    const handleLocked = (e: Event) => {
      const detail = normalizeLockoutPayload((e as CustomEvent).detail);
      if (detail) setLockoutInfo(detail);
    };
    const handleUnlocked = () => setLockoutInfo(null);
    window.addEventListener('payment-locked', handleLocked);
    window.addEventListener('payment-unlocked', handleUnlocked);
    return () => {
      window.removeEventListener('payment-locked', handleLocked);
      window.removeEventListener('payment-unlocked', handleUnlocked);
    };
  }, []);

  useEffect(() => {
    if (!user || user.userType === 'admin' || isLockoutPaidPage) return;

    let cancelled = false;
    setLockoutChecking(true);
    membersApi.getMyPaymentLockout().then((res) => {
      if (cancelled || !res.success) return;
      const payload = (res.data as { isLocked?: boolean; lockout?: unknown }) ?? res;
      if (payload.isLocked && payload.lockout) {
        const info = normalizeLockoutPayload(payload);
        if (info) setLockoutInfo(info);
      } else {
        setLockoutInfo(null);
      }
    }).finally(() => {
      if (!cancelled) setLockoutChecking(false);
    });

    return () => { cancelled = true; };
  }, [user, isLockoutPaidPage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (lockoutChecking && !lockoutInfo && user.userType !== 'admin' && !isLockoutPaidPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Checking account status…</p>
        </div>
      </div>
    );
  }

  if (lockoutInfo && user.userType !== 'admin' && !isLockoutPaidPage) {
    return <PaymentLockoutScreen lockout={lockoutInfo} />;
  }

  if (termsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking terms acceptance...</p>
        </div>
      </div>
    );
  }

  if (user.userType !== 'admin' && pendingTermsAcceptances.length > 0) {
    return <TermsAcceptanceGate />;
  }

  return <>{children}</>;
}
